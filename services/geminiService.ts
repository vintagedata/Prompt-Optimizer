import { GoogleGenAI, Type } from "@google/genai";
import type { AnalysisResult } from '../types';

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    originalTokenCount: {
      type: Type.INTEGER,
      description: 'The estimated token count of the original user prompt.',
    },
    optimizedPrompt: {
      type: Type.STRING,
      description: 'The rewritten, more token-efficient version of the prompt.',
    },
    optimizedTokenCount: {
      type: Type.INTEGER,
      description: 'The estimated token count of the new, optimized prompt.',
    },
    explanation: {
      type: Type.STRING,
      description: 'A brief explanation of the changes made and why they reduce token count. Use markdown for formatting if needed.',
    },
  },
  required: ['originalTokenCount', 'optimizedPrompt', 'optimizedTokenCount', 'explanation'],
};

const systemInstruction = `You are an expert prompt engineer specializing in optimizing prompts for Large Language Models to reduce token count. 
Your task is to take a user's prompt, analyze it, and rewrite it to be more concise and token-efficient without losing the original intent or essential details. 
You must also provide an estimated token count for both the original and the optimized prompt. 
You are not to answer or fulfill the prompt's request, only to optimize it.
Respond ONLY with a valid JSON object matching the provided schema.`;

export async function analyzeAndOptimizePrompt(prompt: string): Promise<AnalysisResult> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [{ text: prompt }],
      },
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.2,
      },
    });

    const jsonText = response.text.trim();
    const parsedResult = JSON.parse(jsonText);

    // Basic validation to ensure the result matches the interface
    if (
      typeof parsedResult.originalTokenCount === 'number' &&
      typeof parsedResult.optimizedPrompt === 'string' &&
      typeof parsedResult.optimizedTokenCount === 'number' &&
      typeof parsedResult.explanation === 'string'
    ) {
      return parsedResult as AnalysisResult;
    } else {
      throw new Error("API response does not match expected format.");
    }
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    if (error instanceof Error) {
        throw new Error(`Failed to analyze prompt: ${error.message}`);
    }
    throw new Error("An unknown error occurred while analyzing the prompt.");
  }
}

export async function executePrompt(prompt: string): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: { parts: [{ text: prompt }] },
      config: {
        temperature: 0.7,
      }
    });
    return response.text;
  } catch (error) {
    console.error("Error executing prompt with Gemini API:", error);
    if (error instanceof Error) {
        throw new Error(`Failed to execute prompt: ${error.message}`);
    }
    throw new Error("An unknown error occurred while executing the prompt.");
  }
}