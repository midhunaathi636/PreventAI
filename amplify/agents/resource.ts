import { existsSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { Duration, Stack } from 'aws-cdk-lib';
import {
  Architecture,
  Code,
  Function as LambdaFunction,
  FunctionUrlAuthType,
  LoggingFormat,
  Runtime,
} from 'aws-cdk-lib/aws-lambda';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';

/**
 * The PreventAI agent service, as a Lambda behind a Function URL.
 *
 * The same FastAPI app that runs under uvicorn locally is served here through
 * Mangum. A Function URL rather than API Gateway: there is exactly one origin
 * calling it, and the service does its own Cognito token verification, so an
 * API Gateway authorizer would be a second place to configure the same rule.
 *
 * The code asset is `backend/.lambda-bundle/`, produced by
 * `scripts/build-agent-bundle.mjs`. That runs in the build phase of
 * amplify.yml rather than as a CDK bundling step because Amplify's build
 * container has Python but not Docker.
 */

const BUNDLE_PATH = fileURLToPath(new URL('../../backend/.lambda-bundle', import.meta.url));

// Must match PYTHON_VERSION in scripts/build-agent-bundle.mjs — the vendored
// wheels are built for one interpreter version and will not import on another.
const RUNTIME = Runtime.PYTHON_3_12;

export interface AgentServiceProps {
  /** Cognito user pool whose access tokens the service will accept. */
  userPoolId: string;
  /** Browser origins allowed to call it. `['*']` is the default. */
  corsOrigins?: string[];
  /** Optional LLM enrichment. Omitted means the pipeline runs on rules alone. */
  llm?: {
    provider: 'anthropic' | 'openai';
    model?: string;
    /** Pass a secret reference, never a literal key. */
    apiKey: string;
  };
}

export class AgentService {
  readonly fn: LambdaFunction;
  readonly url: string;

  constructor(scope: Construct, id: string, props: AgentServiceProps) {
    if (!existsSync(BUNDLE_PATH)) {
      throw new Error(
        `Agent Lambda bundle not found at ${BUNDLE_PATH}.\n` +
          'Run `npm run build:agents` before `npx ampx sandbox` or `ampx pipeline-deploy`.\n' +
          '(In CI this is handled by amplify.yml.)'
      );
    }

    const corsOrigins = props.corsOrigins ?? ['*'];
    const region = Stack.of(scope).region;

    this.fn = new LambdaFunction(scope, id, {
      runtime: RUNTIME,
      architecture: Architecture.X86_64,
      handler: 'lambda_handler.handler',
      code: Code.fromAsset(BUNDLE_PATH),
      // The pipeline is pure CPU with no I/O; more memory buys proportionally
      // more CPU, which mostly shortens the cold start.
      memorySize: 1024,
      timeout: Duration.seconds(30),
      loggingFormat: LoggingFormat.JSON,
      logRetention: RetentionDays.TWO_WEEKS,
      environment: {
        PREVENTAI_ENVIRONMENT: 'prod',
        PREVENTAI_COGNITO_USER_POOL_ID: props.userPoolId,
        PREVENTAI_COGNITO_REGION: region,
        PREVENTAI_CORS_ORIGINS: JSON.stringify(corsOrigins),
        ...(props.llm
          ? {
              PREVENTAI_LLM_PROVIDER: props.llm.provider,
              PREVENTAI_LLM_MODEL: props.llm.model ?? 'claude-sonnet-4-5',
              [props.llm.provider === 'anthropic'
                ? 'PREVENTAI_ANTHROPIC_API_KEY'
                : 'PREVENTAI_OPENAI_API_KEY']: props.llm.apiKey,
            }
          : { PREVENTAI_LLM_PROVIDER: 'none' }),
      },
    });

    // AuthType NONE does not mean unauthenticated: every request is checked
    // against the Cognito pool inside the function. IAM auth would require the
    // browser to SigV4-sign requests, which is the wrong tool when the client
    // already holds a Cognito access token.
    //
    // CORS is deliberately NOT configured here. A Function URL with its own
    // cors block applies headers at the edge *in addition to* whatever the
    // application returns, so the browser receives two
    // `access-control-allow-origin` values and rejects the response. FastAPI's
    // CORSMiddleware already handles preflight and headers, so it owns CORS
    // outright — which also means the behaviour is identical locally and
    // deployed. Origins reach it through PREVENTAI_CORS_ORIGINS below.
    const fnUrl = this.fn.addFunctionUrl({
      authType: FunctionUrlAuthType.NONE,
    });

    // A CloudFormation token at synth time, so it cannot be string-manipulated
    // here. The resolved value ends in a slash; the frontend client normalises
    // it before appending `/v1/...`.
    this.url = fnUrl.url;
  }
}
