"""
AWS Lambda entry point for the agent service.

The same FastAPI app that runs under uvicorn locally is served here through
Mangum, which adapts Lambda's event/context pair to ASGI. Nothing in `app/`
knows it is running in Lambda.

Deployed behind a Function URL (see `amplify/agents/resource.ts`), so there is
no API Gateway to configure. Authentication is the service's own Cognito JWT
verification rather than the Function URL's IAM mode: the frontend already
holds a Cognito access token, and IAM auth would mean signing requests with
SigV4 from the browser.
"""

from __future__ import annotations

from mangum import Mangum

from app.main import app

# `lifespan="off"`: Lambda freezes the execution environment between
# invocations, so ASGI lifespan events are not a reliable place to build state.
# The pipeline is constructed lazily instead (see app/main.py).
handler = Mangum(app, lifespan="off")
