"use client";

import { useState } from "react";
import Image from "next/image";

export default function Home() {
  const [inputJson, setInputJson] = useState("");
  const [result, setResult] = useState<{
    fraudScore: number;
    similarTransactions: any[];
  } | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);
    setIsLoading(true);

    try {
      const paymentData = JSON.parse(inputJson);

      const response = await fetch("/api/analyze-fraud", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(paymentData),
      });

      if (!response.ok) {
        throw new Error("Failed to analyze transaction");
      }

      const analysis = await response.json();
      setResult(analysis);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "An error occurred while analyzing the transaction"
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen p-8 pb-20 gap-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Fraud Detection Analysis</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="json-input"
            className="block text-sm font-medium mb-2"
          >
            Enter Transaction JSON:
          </label>
          <textarea
            id="json-input"
            value={inputJson}
            onChange={(e) => setInputJson(e.target.value)}
            className="w-full h-48 p-2 border rounded font-mono text-sm"
            placeholder='{
  "amount": 100,
  "location": {
    "city": "Seattle",
    "state": "WA",
    "country": "USA"
  },
  "payment_method": "Credit Card",
  "device_type": "mobile",
  "retailer": "Amazon",
  "retailer_category": "E-commerce",
  "time": "14:23:45"
}'
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-blue-300"
        >
          {isLoading ? "Analyzing..." : "Analyze Transaction"}
        </button>
      </form>

      {error && (
        <div className="mt-4 p-4 bg-red-100 text-red-700 rounded">{error}</div>
      )}

      {result && (
        <div className="mt-8 space-y-6">
          <div className="p-4 bg-gray-100 rounded">
            <h2 className="text-xl font-semibold mb-2">Analysis Result</h2>
            <div className="space-y-2">
              <p>
                Fraud Score:{" "}
                <span
                  className={`font-bold ${
                    result.fraudScore > 0.7
                      ? "text-red-600"
                      : result.fraudScore > 0.4
                      ? "text-yellow-600"
                      : "text-green-600"
                  }`}
                >
                  {(result.fraudScore * 100).toFixed(1)}%
                </span>
              </p>
              <p>
                Risk Level:{" "}
                <span
                  className={`font-bold ${
                    result.fraudScore > 0.7
                      ? "text-red-600"
                      : result.fraudScore > 0.4
                      ? "text-yellow-600"
                      : "text-green-600"
                  }`}
                >
                  {result.fraudScore > 0.7
                    ? "High Risk"
                    : result.fraudScore > 0.4
                    ? "Medium Risk"
                    : "Low Risk"}
                </span>
              </p>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">
              Similar Transactions Found:
            </h3>
            <div className="space-y-2">
              {result.similarTransactions.map((transaction, index) => (
                <div
                  key={index}
                  className="p-3 bg-gray-50 rounded border text-sm"
                >
                  <pre className="whitespace-pre-wrap">
                    {JSON.stringify(transaction.payload, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
