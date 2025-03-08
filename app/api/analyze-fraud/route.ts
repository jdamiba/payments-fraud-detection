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

function calculateFraudScore(payment: any, similarTransactions: any[]): number {
  let score = 0;

  // Check if amount is significantly different from similar transactions
  const similarAmounts = similarTransactions.map((t) => t.payload.amount);
  const avgAmount =
    similarAmounts.reduce((a, b) => a + b, 0) / similarAmounts.length;
  if (payment.amount > avgAmount * 2) {
    score += 0.3; // Unusual amount
  }

  // Check if device type is different from usual
  const unusualDevice = !similarTransactions.some(
    (t) => t.payload.device_type === payment.device_type
  );
  if (unusualDevice) {
    score += 0.2; // Unusual device
  }

  // Check if location is different from usual
  const unusualLocation = !similarTransactions.some(
    (t) =>
      t.payload.location.city === payment.location.city &&
      t.payload.location.state === payment.location.state
  );
  if (unusualLocation) {
    score += 0.3; // Unusual location
  }

  // Check if payment method differs from usual
  const unusualPaymentMethod = !similarTransactions.some(
    (t) => t.payload.payment_method === payment.payment_method
  );
  if (unusualPaymentMethod) {
    score += 0.2; // Unusual payment method
  }

  return Math.min(score, 1); // Normalize to 0-1 range
}

export async function POST(request: Request) {
  try {
    const payment = await request.json();

    // Get vector for the new transaction
    const vector = await createTransactionVector(payment);

    // Search for similar transactions
    const searchResults = await qdrantClient.search(COLLECTION_NAME, {
      vector: vector,
      limit: 5,
      with_payload: true,
    });

    // Calculate fraud score
    const fraudScore = calculateFraudScore(payment, searchResults);

    return NextResponse.json({
      fraudScore,
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
