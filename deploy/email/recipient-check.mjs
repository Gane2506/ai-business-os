import {SESv2Client,GetEmailIdentityCommand} from '@aws-sdk/client-sesv2';
const c=new SESv2Client({region:'ca-central-1'});
try {const x=await c.send(new GetEmailIdentityCommand({EmailIdentity:'admin@example.com'}));console.log(JSON.stringify({recipient:'admin@example.com',verified:x.VerifiedForSendingStatus,verificationStatus:x.VerificationStatus}));}catch(e){console.log(JSON.stringify({operation:'GetEmailIdentity',recipient:'admin@example.com',errorType:e.name,httpStatus:e.$metadata?.httpStatusCode}));process.exitCode=1;}finally{c.destroy();}
