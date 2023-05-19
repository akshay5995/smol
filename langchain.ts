import { ChatOpenAI } from "langchain/chat_models";
import {
  ChatPromptTemplate,
  HumanMessagePromptTemplate,
  SystemMessagePromptTemplate,
} from "langchain/prompts";
import { LLMChain } from "langchain";

const openAiModel = process.env.OPENAI_MODEL || "gpt-3.5-turbo";
const openAiMaxTokens = 2000;

const chat = new ChatOpenAI({
  temperature: 0.3,
  topP: 1,
  modelName: openAiModel,
});

export async function generateResponse(
  systemPrompt: string,
  userPrompt: string
): Promise<string | undefined> {
  try {
    const chatPrompt = ChatPromptTemplate.fromPromptMessages([
      SystemMessagePromptTemplate.fromTemplate(
        systemPrompt.replaceAll("{", "").replaceAll("}", "")
      ),
      HumanMessagePromptTemplate.fromTemplate(
        userPrompt.replaceAll("{", "").replaceAll("}", "")
      ),
    ]);

    const chain = new LLMChain({
      prompt: chatPrompt,
      llm: chat,
    });

    const chainReponse = await chain.call({});

    return chainReponse.text as string;
  } catch (error) {
    console.log("Generate response error:", error);
    throw error;
  }
}
