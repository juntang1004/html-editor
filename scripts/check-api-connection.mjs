// Explicit opt-in connection check; never part of automated/mock test suites.
import path from 'node:path';
import {loadConfiguration} from '../server.mjs';
const configuration=loadConfiguration({directory:path.join(process.env.APPDATA,'com.slidestudio.editor'),env:{}});
if(!configuration.apiKey) throw new Error('Local application API configuration is missing.');
const response=await fetch('https://api.openai.com/v1/models/'+encodeURIComponent(configuration.model),{
  headers:{Authorization:'Bearer '+configuration.apiKey},signal:AbortSignal.timeout(20000)
});
console.log(JSON.stringify({check:'model-access',status:response.status,model:configuration.model,ok:response.ok}));
if(!response.ok)process.exitCode=1;
