import { defineBackend } from '@aws-amplify/backend';
import { AgentService } from './agents/resource';
import { auth } from './auth/resource';
import { data } from './data/resource';

/**
 * PreventAI backend — Amplify Gen 2.
 *
 *   auth    Cognito user pool (patients + clinicians)
 *   data    AppSync + DynamoDB
 *   agents  The four-agent clinical pipeline, as a Python Lambda behind a
 *           Function URL (see ./agents/resource.ts)
 *
 * One `git push` deploys all three. The agent service's URL is published into
 * `amplify_outputs.json` as `custom.agentServiceUrl`, so the frontend
 * discovers it automatically and no environment variable has to be set by
 * hand in the Amplify console.
 */
const backend = defineBackend({
  auth,
  data,
});

const agentStack = backend.createStack('PreventAIAgents');

const agents = new AgentService(agentStack, 'AgentService', {
  userPoolId: backend.auth.resources.userPool.userPoolId,
  // The Amplify Hosting domain is not known at synthesis time, and the
  // service authenticates by bearer token rather than cookies, so a wildcard
  // origin is safe here. To lock it to one domain, replace this with
  // ['https://your-domain.com'] once the app is deployed.
  corsOrigins: ['*'],
  // To enable LLM enrichment, store the key in AWS Secrets Manager and pass it
  // here — never inline the literal value:
  //   llm: { provider: 'anthropic', apiKey: secret('ANTHROPIC_API_KEY') },
});

backend.addOutput({
  custom: {
    agentServiceUrl: agents.url,
  },
});
