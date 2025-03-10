import { OpenAI } from "openai";
import { QdrantClient } from "@qdrant/js-client-rest";
import { NextResponse } from "next/server";

const COLLECTION_NAME = "fraud-detection";

// Initialize clients (server-side only)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const qdrantClient = new QdrantClient({
  url: "https://7d267fc5-d69b-40f3-92a3-0bb8ffb19abe.us-west-1-0.aws.cloud.qdrant.io",
  apiKey: process.env.QDRANT_API_KEY,
});

async function getEmbedding(text: string) {
  const response = await openai.embeddings.create({
    model: "text-embedding-ada-002",
    input: text,
  });
  return response.data[0].embedding;
}

async function createTransactionVector(payment: any) {
  const transactionText = `
    Amount: ${payment.amount}
    Location: ${payment.location.city}, ${payment.location.state}, ${payment.location.country}
    Payment Method: ${payment.payment_method}
    Device: ${payment.device_type}
    Retailer: ${payment.retailer}
    Category: ${payment.retailer_category}
    Time: ${payment.time}
  `.trim();

  return await getEmbedding(transactionText);
}

interface FraudAnalysis {
  score: number;
  reasons: {
    amount?: {
      current: number;
      typical: number;
      difference: string;
    };
    location?: {
      current: string;
      typical: string[];
    };
    device?: {
      current: string;
      typical: string[];
    };
    paymentMethod?: {
      current: string;
      typical: string[];
    };
  };
}

function analyzeFraudFactors(
  payment: any,
  similarTransactions: any[]
): FraudAnalysis {
  const analysis: FraudAnalysis = {
    score: 0,
    reasons: {},
  };

  // Analyze amount
  const similarAmounts = similarTransactions.map((t) => t.payload.amount);
  const avgAmount =
    similarAmounts.reduce((a, b) => a + b, 0) / similarAmounts.length;
  if (payment.amount > avgAmount * 2) {
    analysis.score += 0.3;
    analysis.reasons.amount = {
      current: payment.amount,
      typical: avgAmount,
      difference: `${((payment.amount / avgAmount - 1) * 100).toFixed(
        0
      )}% higher`,
    };
  }

  // Analyze device type
  const deviceTypes = new Set(
    similarTransactions.map((t) => t.payload.device_type)
  );
  if (!deviceTypes.has(payment.device_type)) {
    analysis.score += 0.2;
    analysis.reasons.device = {
      current: payment.device_type,
      typical: Array.from(deviceTypes),
    };
  }

  // Analyze location
  const locations = new Set(
    similarTransactions.map(
      (t) => `${t.payload.location.city}, ${t.payload.location.state}`
    )
  );
  const currentLocation = `${payment.location.city}, ${payment.location.state}`;
  if (!locations.has(currentLocation)) {
    analysis.score += 0.3;
    analysis.reasons.location = {
      current: currentLocation,
      typical: Array.from(locations),
    };
  }

  // Analyze payment method
  const paymentMethods = new Set(
    similarTransactions.map((t) => t.payload.payment_method)
  );
  if (!paymentMethods.has(payment.payment_method)) {
    analysis.score += 0.2;
    analysis.reasons.paymentMethod = {
      current: payment.payment_method,
      typical: Array.from(paymentMethods),
    };
  }

  analysis.score = Math.min(analysis.score, 1);
  return analysis;
}

export async function POST(request: Request) {
  try {
    const payment = await request.json();
    const vector = await createTransactionVector(payment);

    const searchResults = await qdrantClient.search(COLLECTION_NAME, {
      vector: vector,
      limit: 50,
      with_payload: true,
    });

    const analysis = analyzeFraudFactors(payment, searchResults);

    return NextResponse.json({
      fraudScore: analysis.score,
      analysis: analysis.reasons,
      similarTransactions: searchResults,
    });
  } catch (error) {
    console.error("Error analyzing fraud:", error);
    return NextResponse.json(
      { error: "Error analyzing transaction" },
      { status: 500 }
    );
  }
}
