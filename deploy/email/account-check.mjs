import { SESv2Client, GetAccountCommand, GetEmailIdentityCommand, GetConfigurationSetCommand, GetConfigurationSetEventDestinationsCommand } from '@aws-sdk/client-sesv2';
const client = new SESv2Client({region:'ca-central-1'});
const report={region:'ca-central-1',testRecipient:'admin@example.com',checkedAt:new Date().toISOString(),identities:[]};
let operation='GetAccount';
try {
 const account=await client.send(new GetAccountCommand({}));
 report.account={productionAccess:account.ProductionAccessEnabled,sendingEnabled:account.SendingEnabled,quota:account.SendQuota};
 operation='GetEmailIdentity';
 for(const prefix of ['auth','tx','mail','news','offers','outreach']){
  const domain=`${prefix}.connectxmedia.com`;
  try {const x=await client.send(new GetEmailIdentityCommand({EmailIdentity:domain}));report.identities.push({domain,exists:true,verified:x.VerifiedForSendingStatus,dkim:x.DkimAttributes?.Status,mailFrom:x.MailFromAttributes?.MailFromDomainStatus,configurationSet:x.ConfigurationSetName});}
  catch(e){if(e.name==='NotFoundException')report.identities.push({domain,exists:false});else throw e;}
 }
 operation='GetConfigurationSet';
 report.configurationSets=[];
 for(const stream of ['auth','transactional','communication','marketing','promotional','outreach']){
  const name=`ses-${stream}`;
  try {const x=await client.send(new GetConfigurationSetCommand({ConfigurationSetName:name}));operation='GetConfigurationSetEventDestinations';const events=await client.send(new GetConfigurationSetEventDestinationsCommand({ConfigurationSetName:name}));report.configurationSets.push({name,exists:true,sendingEnabled:x.SendingOptions?.SendingEnabled,eventDestinationCount:events.EventDestinations?.length??0});operation='GetConfigurationSet';}
  catch(e){if(e.name==='NotFoundException')report.configurationSets.push({name,exists:false});else throw e;}
 }
 console.log(JSON.stringify(report,null,2));
} catch(e){console.log(JSON.stringify({region:report.region,status:'failed',operation,account:report.account,identities:report.identities,errorType:e.name,httpStatus:e.$metadata?.httpStatusCode}));process.exitCode=1;}finally{client.destroy();}
