import { validateConfig, STREAMS } from '../core.mjs';

export function buildPolicies({ accountId, region, rootDomain, topicName, feedbackEndpoint }) {
  if (!/^\d{12}$/.test(accountId || '')) throw new Error('Exact AWS account ID required');
  validateConfig({ region, tenants: [{ tenantId: 'policy', rootDomain }] });
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(topicName || '')) throw new Error('Exact standard SNS topic name required');
  const url = new URL(feedbackEndpoint);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Exact HTTPS feedback endpoint required');
  const identity = s => `arn:aws:ses:${region}:${accountId}:identity/${s.prefix}.${rootDomain}`;
  const set = s => `arn:aws:ses:${region}:${accountId}:configuration-set/${s.configurationSet}`;
  const from = s => `noreply@${s.prefix}.${rootDomain}`;
  const topic = `arn:aws:sns:${region}:${accountId}:${topicName}`;
  const allowed = STREAMS.filter(s => s.stream !== 'OUTREACH');
  const condition = { StringEquals: { 'aws:RequestedRegion': region } };
  const policy = Statement => ({ Version: '2012-10-17', Statement });
  function senderPolicy(streams, action, read = false) {
    const entries = streams.map(s => ({ Sid: `Send${s.stream}`, Effect: 'Allow', Action: action,
      Resource: [identity(s), set(s)], Condition: { StringEquals: { 'aws:RequestedRegion': region, 'ses:FromAddress': from(s) } } }));
    entries.unshift({ Sid: 'DenyAllOtherSenderAddresses', Effect: 'Deny', Action: ['ses:SendEmail', 'ses:SendRawEmail', 'ses:SendBulkEmail'],
      Resource: '*', Condition: { StringNotEquals: { 'ses:FromAddress': streams.map(from) } } });
    entries.unshift({ Sid: 'DenySendingOutsideChosenRegion', Effect: 'Deny', Action: ['ses:SendEmail', 'ses:SendRawEmail', 'ses:SendBulkEmail'],
      Resource: '*', Condition: { StringNotEquals: { 'aws:RequestedRegion': region } } });
    if (read) entries.push({ Sid: 'ReadAccountQuotaAndSuppression', Effect: 'Allow', Action: ['ses:GetAccount', 'ses:GetSuppressedDestination'], Resource: '*', Condition: condition },
      { Sid: 'ReadExactSendingIdentities', Effect: 'Allow', Action: 'ses:GetEmailIdentity', Resource: streams.map(identity), Condition: condition });
    return policy(entries);
  }
  return {
    'runtime-api.example.json': senderPolicy(allowed, 'ses:SendEmail', true),
    'mautic-smtp.example.json': senderPolicy(allowed.filter(s => ['MARKETING', 'PROMOTIONAL'].includes(s.stream)), 'ses:SendRawEmail'),
    // Proposed scope only; parent must confirm Twenty message classification.
    'twenty-smtp-draft.example.json': senderPolicy(allowed.filter(s => ['AUTH', 'COMMUNICATION'].includes(s.stream)), 'ses:SendRawEmail'),
    'sns-topic-publish.example.json': policy([{ Sid: 'PublishOnlyFromPlannedSESConfigurationSets', Effect: 'Allow',
      Principal: { Service: 'ses.amazonaws.com' }, Action: 'sns:Publish', Resource: topic,
      Condition: { StringEquals: { 'AWS:SourceAccount': accountId, 'AWS:SourceArn': STREAMS.map(set) } } }]),
    'sns-operator-managed.example.json': policy([
      { Sid: 'ManageExactFeedbackTopic', Effect: 'Allow', Action: ['sns:CreateTopic', 'sns:GetTopicAttributes', 'sns:SetTopicAttributes', 'sns:ListSubscriptionsByTopic'], Resource: topic, Condition: condition },
      { Sid: 'SubscribeOnlyExactBackendHTTPS', Effect: 'Allow', Action: 'sns:Subscribe', Resource: topic,
        Condition: { StringEquals: { 'aws:RequestedRegion': region, 'sns:Protocol': 'https', 'sns:Endpoint': feedbackEndpoint } } },
      { Sid: 'ConfirmAndInspectExactTopicSubscription', Effect: 'Allow', Action: ['sns:ConfirmSubscription', 'sns:GetSubscriptionAttributes'], Resource: topic, Condition: condition },
    ]),
  };
}
