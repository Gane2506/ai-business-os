<?php

declare(strict_types=1);

namespace MauticPlugin\AiOsSesBundle\EventListener;

use Mautic\CoreBundle\Security\Permissions\CorePermissions;
use Mautic\EmailBundle\EmailEvents;
use Mautic\EmailBundle\Event\EmailEvent;
use Mautic\EmailBundle\Event\EmailSendEvent;
use Mautic\EmailBundle\Event\TransportWebhookEvent;
use Mautic\EmailBundle\Model\TransportCallback;
use Mautic\LeadBundle\Entity\DoNotContact;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Mailer\Event\MessageEvent;
use Symfony\Component\Mime\Email;

final readonly class SesSubscriber implements EventSubscriberInterface
{
    public function __construct(private CorePermissions $permissions, private TransportCallback $callback)
    {
    }

    public static function getSubscribedEvents(): array
    {
        return [
            EmailEvents::EMAIL_PRE_SAVE => ['validateAuthor', 10000],
            EmailEvents::EMAIL_PRE_SEND => ['validateCampaign', -10000],
            MessageEvent::class => ['validateTransport', -10000],
            EmailEvents::ON_TRANSPORT_WEBHOOK => ['feedback', 10000],
        ];
    }

    private function rootDomain(): string
    {
        $domain = strtolower((string) getenv('AI_OS_SES_ROOT_DOMAIN'));
        if (!preg_match('/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/D', $domain)) {
            throw new \RuntimeException('AI OS SES tenant root domain must be configured');
        }

        return $domain;
    }

    private function streamFor(string $address): string
    {
        $root = $this->rootDomain();

        return match (strtolower($address)) {
            'noreply@news.'.$root => 'ses-marketing',
            'noreply@offers.'.$root => 'ses-promotional',
            default => throw new \RuntimeException('AI OS SES sender is not authorized for this Mautic tenant'),
        };
    }

    public function validateAuthor(EmailEvent $event): void
    {
        $email = $event->getEmail();
        $from = (string) ($email->getFromAddress() ?: 'noreply@news.'.$this->rootDomain());
        $stream = $this->streamFor($from);
        if ('ses-promotional' === $stream && !$this->permissions->isGranted('aiOsSes:sender:promotional')) {
            throw new \RuntimeException('Promotional sender requires the AI OS SES promotional role permission');
        }
        if ($email->getUseOwnerAsMailer() || $email->getSendToDnc()) {
            throw new \RuntimeException('Owner sender overrides and sending to DNC contacts are forbidden');
        }
        $email->setFromAddress(strtolower($from));
    }

    public function validateCampaign(EmailSendEvent $event): void
    {
        $email = $event->getEmail();
        if ($email && ($email->getUseOwnerAsMailer() || $email->getSendToDnc())) {
            $event->enableFatal();
            $event->addError('AI OS SES policy forbids DNC bypass and owner sender overrides');
        }
    }

    public function validateTransport(MessageEvent $event): void
    {
        if ('true' !== getenv('AI_OS_SES_SEND_ENABLED')) {
            throw new \RuntimeException('AI OS SES sending is disabled');
        }
        $message = $event->getMessage();
        if (!$message instanceof Email || 1 !== count($message->getFrom())) {
            throw new \RuntimeException('AI OS SES requires one explicit sender');
        }
        $stream = $this->streamFor($message->getFrom()[0]->getAddress());
        // Enforce the actual resolved message, including owner/token/config/test
        // sends, rather than trusting a UI field or an editable custom header.
        $headers = $message->getHeaders();
        foreach (['X-SES-CONFIGURATION-SET', 'X-SES-SOURCE-ARN', 'X-SES-FROM-ARN', 'X-SES-RETURN-PATH-ARN'] as $name) {
            $headers->removeAll($name);
        }
        $headers->addTextHeader('X-SES-CONFIGURATION-SET', $stream);
        if (!$headers->has('List-Unsubscribe') || !$headers->has('List-Unsubscribe-Post')) {
            throw new \RuntimeException('Mautic optional email requires native unsubscribe headers');
        }
    }

    public function feedback(TransportWebhookEvent $event): void
    {
        $request = $event->getRequest();
        $body = $request->getContent();
        $timestamp = (string) $request->headers->get('X-Ai-Os-Timestamp');
        $signature = (string) $request->headers->get('X-Ai-Os-Signature');
        $secret = (string) getenv('AI_OS_SES_FEEDBACK_SECRET');
        if (!$request->isMethod('POST') || strlen($body) > 32768 || strlen($secret) < 32 ||
            !ctype_digit($timestamp) || abs(time() - (int) $timestamp) > 300 ||
            !preg_match('/^[a-f0-9]{64}$/D', $signature) ||
            !hash_equals(hash_hmac('sha256', $timestamp.'.'.$body, $secret), $signature)) {
            $event->setResponse(new JsonResponse(['error' => 'Invalid feedback signature'], 401));
            $event->stopPropagation();

            return;
        }
        $payload = json_decode($body, true, 16, JSON_THROW_ON_ERROR);
        $expected = match ($payload['reason'] ?? null) {
            'HARD_BOUNCE' => 'Bounce',
            'COMPLAINT' => 'Complaint',
            default => null,
        };
        $domain = $payload['identityDomain'] ?? '';
        $recipients = $payload['recipients'] ?? null;
        if (null === $expected || $expected !== ($payload['type'] ?? null) ||
            !in_array($domain, ['news.'.$this->rootDomain(), 'offers.'.$this->rootDomain()], true) ||
            !is_array($recipients) || 0 === count($recipients) || count($recipients) > 50) {
            $event->setResponse(new JsonResponse(['error' => 'Invalid tenant feedback'], 400));
            $event->stopPropagation();

            return;
        }
        foreach ($recipients as $address) {
            if (!is_string($address) || false === filter_var($address, FILTER_VALIDATE_EMAIL)) {
                $event->setResponse(new JsonResponse(['error' => 'Invalid feedback recipient'], 400));
                $event->stopPropagation();

                return;
            }
        }
        foreach ($recipients as $address) {
            // Native DNC updates are idempotent and preserve an existing
            // unsubscribe. A complaint is an unsubscribe, not a failed delivery.
            $reason = 'Complaint' === $expected ? DoNotContact::UNSUBSCRIBED : DoNotContact::BOUNCED;
            $this->callback->addFailureByAddress($address, 'SES '.$expected, $reason);
        }
        $event->setResponse(new JsonResponse(['received' => true]));
        $event->stopPropagation();
    }
}
