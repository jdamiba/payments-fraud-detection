import { QdrantClient } from "@qdrant/js-client-rest";
import { OpenAI } from "openai";
import paymentsHistory from "../../payments-history.json";

const COLLECTION_NAME = "fraud-detection";

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function getEmbedding(text: string) {
  const response = await openai.embeddings.create({
    model: "text-embedding-ada-002",
    input: text,
  });
  return response.data[0].embedding;
}

async function createTransactionVector(payment: any) {
  // Create a structured text representation of important features
  const transactionText = `
    Amount: ${payment.amount}
    Location: ${payment.location.city}, ${payment.location.state}, ${payment.location.country}
    Payment Method: ${payment.payment_method}
    Device: ${payment.device_type}
    Retailer: ${payment.retailer}
    Category: ${payment.retailer_category}
    Time: ${payment.time}
  `.trim();

  // Get embedding for the transaction text
  return await getEmbedding(transactionText);
}

async function uploadPaymentsToQdrant() {
  try {
    const client = new QdrantClient({
      url: "https://7d267fc5-d69b-40f3-92a3-0bb8ffb19abe.us-west-1-0.aws.cloud.qdrant.io",
      apiKey: process.env.QDRANT_API_KEY,
    });

    // Create collection if it doesn't exist
    await client.createCollection(COLLECTION_NAME, {
      vectors: {
        size: 1536, // Ada-002 embedding size
        distance: "Cosine",
      },
      on_disk_payload: true,
    });

    // Create payload indexes for important fields
    await Promise.all([
      client.createPayloadIndex(COLLECTION_NAME, {
        field_name: "amount",
        field_schema: "float",
      }),
      client.createPayloadIndex(COLLECTION_NAME, {
        field_name: "device_type",
        field_schema: "keyword",
      }),
      client.createPayloadIndex(COLLECTION_NAME, {
        field_name: "payment_method",
        field_schema: "keyword",
      }),
    ]);

    // Process payments in batches to avoid rate limits
    const BATCH_SIZE = 20; // Smaller batch size due to API rate limits
    for (
      let i = 0;
      i < paymentsHistory.payment_history.length;
      i += BATCH_SIZE
    ) {
      const batchPayments = paymentsHistory.payment_history.slice(
        i,
        i + BATCH_SIZE
      );

      // Get vectors for all payments in the batch
      const batchPoints = await Promise.all(
        batchPayments.map(async (payment, batchIndex) => {
          const vector = await createTransactionVector(payment);
          return {
            id: i + batchIndex,
            vector,
            payload: {
              transaction_id: payment.transaction_id,
              date: payment.date,
              time: payment.time,
              amount: payment.amount,
              retailer: payment.retailer,
              retailer_category: payment.retailer_category,
              payment_method: payment.payment_method,
              card_last_four: payment.card_last_four,
              device_type: payment.device_type,
              location: payment.location,
              ip_address: payment.ip_address,
            },
          };
        })
      );

      // Upload batch
      await client.upsert(COLLECTION_NAME, {
        points: batchPoints,
      });
      console.log(`Uploaded batch ${Math.floor(i / BATCH_SIZE) + 1}`);

      // Add a small delay to avoid rate limits
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.log("Successfully uploaded all payment records to Qdrant");
  } catch (error) {
    console.error("Error uploading to Qdrant:", error);
  }
}

export default uploadPaymentsToQdrant;
