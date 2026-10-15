<?php

declare(strict_types=1);

namespace MauticPlugin\AiOsSesBundle\Security\Permissions;

use Mautic\CoreBundle\Security\Permissions\AbstractPermissions;
use Mautic\UserBundle\Form\Type\PermissionListType;
use Symfony\Component\Form\FormBuilderInterface;

final class AiOsSesPermissions extends AbstractPermissions
{
    public function __construct(array $params)
    {
        parent::__construct($params);
        $this->permissions = ['sender' => ['promotional' => 1, 'full' => 2]];
    }

    public function getName(): string
    {
        return 'aiOsSes';
    }

    public function buildForm(FormBuilderInterface &$builder, array $options, array $data): void
    {
        $builder->add('aiOsSes:sender', PermissionListType::class, [
            'choices' => ['Use promotional noreply sender' => 'promotional', 'Full' => 'full'],
            'label' => 'AI OS SES sender policy',
            'data' => $data['sender'] ?? [],
            'bundle' => 'aiOsSes',
            'level' => 'sender',
        ]);
    }
}
