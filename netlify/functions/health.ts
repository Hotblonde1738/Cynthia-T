import { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { OpenAI } from "openai";

interface HealthData {
  status: string;
  timestamp: string;
  openai: string;
  openaiDetails: {
    keyPrefix?: string;
    tested?: boolean;
    modelsAvailable?: number;
    error?: string;
  };
  environment: string;
  netlifyContext: string;
  functionVersion: string;
}

interface ErrorResponse {
  status: string;
  timestamp: string;
  error: string;
  functionVersion: string;
}

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Requested-With, Accept, Origin",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Content-Type": "application/json",
};

export const handler: Handler = async (
  event: HandlerEvent,
  context: HandlerContext
) => {
  // Handle preflight requests
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: "CORS preflight successful" }),
    };
  }

  try {
    console.log("🏥 Health check called");

    let openaiStatus: string = "not configured";
    let openaiDetails: HealthData["openaiDetails"] = {};

    // Check if API key exists
    if (
      process.env.OPENAI_API_KEY &&
      process.env.OPENAI_API_KEY !== "sk-your-real-key-goes-here"
    ) {
      try {
        console.log("🔑 Testing OpenAI API key...");

        const openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
          timeout: 10000,
          maxRetries: 1,
        });

        // Test the API key with a simple request
        const testResponse = await openai.models.list();

        if (testResponse && testResponse.data) {
          openaiStatus = "configured";
          openaiDetails = {
            keyPrefix: process.env.OPENAI_API_KEY.substring(0, 7) + "...",
            tested: true,
            modelsAvailable: testResponse.data.length,
          };
          console.log("✅ OpenAI API key is valid");
        } else {
          throw new Error("Invalid response from OpenAI");
        }
      } catch (error) {
        console.error(
          "❌ OpenAI API key test failed:",
          error instanceof Error ? error.message : "Unknown error"
        );
        openaiStatus = "error";
        openaiDetails = {
          error: error instanceof Error ? error.message : "Unknown error",
          keyPrefix: process.env.OPENAI_API_KEY
            ? process.env.OPENAI_API_KEY.substring(0, 7) + "..."
            : "none",
        };
      }
    } else {
      console.log("❌ No OpenAI API key found");
      openaiDetails = { error: "API key not set or is placeholder value" };
    }

    const healthData: HealthData = {
      status: "OK",
      timestamp: new Date().toISOString(),
      openai: openaiStatus,
      openaiDetails: openaiDetails,
      environment: process.env.NODE_ENV || "production",
      netlifyContext:
        typeof context.clientContext === "string"
          ? context.clientContext
          : "unknown",
      functionVersion: "2.0.0",
    };

    console.log("✅ Health check completed:", healthData);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(healthData),
    };
  } catch (error) {
    console.error("❌ Health check failed:", error);

    const errorResponse: ErrorResponse = {
      status: "ERROR",
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown error",
      functionVersion: "2.0.0",
    };

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify(errorResponse),
    };
  }
};
