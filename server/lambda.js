// AWS Lambda entry (Function URL or API Gateway HTTP API). Same app as the local server.
import { handle } from "hono/aws-lambda"
import { createApp } from "./app.js"
export const handler = handle(createApp())
