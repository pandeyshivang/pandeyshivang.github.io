require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { QdrantClient } = require('@qdrant/js-client-rest');
const neo4j = require('neo4j-driver');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { PromptTemplate } = require('@langchain/core/prompts');
const { StringOutputParser } = require('@langchain/core/output_parsers');
const { RunnableSequence } = require('@langchain/core/runnables');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const QDRANT_URL = process.env.QDRANT_URL;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const NEO4J_URI = process.env.NEO4J_URI;
const NEO4J_USERNAME = process.env.NEO4J_USERNAME || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password123';

const COLLECTION_NAME = "shivang_cv_collection";

// Mock Fallback Data (for local development without API keys)
const MOCK_ANSWERS = {
  "skills": "Shivang Pandey's core iOS stack includes Swift 5.10/6, SwiftUI, UIKit, and Objective-C. He is also skilled in Combine, RxSwift, Core Data, Realm, Kotlin Multiplatform (KMP), GraphQL, and CI/CD tools like Fastlane and GitHub Actions.",
  "experience": "Shivang has 9+ years of experience. He is currently a Senior iOS Developer at Ascendion (August 2024 - Present), working on the loanDepot FinTech app. Previously, he worked at DMI (March 2020 - August 2024) on projects like the London Heathrow Airport app, upGrad, and DSM-5-TR.",
  "projects": "Key projects in Shivang's portfolio include:\n- **loanDepot Mobile App** (FinTech)\n- **LHR London Heathrow Airport App** (Travel/Maps)\n- **upGrad Learning App** (EdTech)\n- **DSM-5-TR® Diagnostic Criteria** (Healthcare)\n- **ERC20 Wallet & CryptCoin** (Blockchain)",
  "contact": "You can contact Shivang Pandey via email at shivang.pandey.dev@gmail.com or by phone at +91-9717779622. His LinkedIn is linkedin.com/in/shivang-pandey-dev and GitHub is github.com/pandeyshivang.",
  "resume": "You can view Shivang's resume directly at https://docs.google.com/document/d/1uXre0GSEdaMbVTZMQM-3qb9vHKEf6NxZ/"
};

// 1. Initialize API Clients if keys are present
let genAI = null;
let embeddingModel = null;
let qdrantClient = null;
let neo4jDriver = null;
let langchainModel = null;

if (GEMINI_API_KEY) {
  try {
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    embeddingModel = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    langchainModel = new ChatGoogleGenerativeAI({
      apiKey: GEMINI_API_KEY,
      modelName: "gemini-1.5-flash",
    });
  } catch (e) {
    console.error("Failed to initialize Gemini models:", e.message);
  }
}

if (QDRANT_URL) {
  try {
    qdrantClient = new QdrantClient({
      url: QDRANT_URL,
      apiKey: QDRANT_API_KEY || undefined,
    });
  } catch (e) {
    console.error("Failed to initialize Qdrant client:", e.message);
  }
}

if (NEO4J_URI) {
  try {
    neo4jDriver = neo4j.driver(
      NEO4J_URI,
      neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD)
    );
  } catch (e) {
    console.error("Failed to initialize Neo4j driver:", e.message);
  }
}

// Helper: Get Vector Embedding
async function getEmbedding(text) {
  if (!embeddingModel) return null;
  const result = await embeddingModel.embedContent(text);
  return result.embedding.values;
}

// Post Chat Endpoint
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: "Message field is required." });
  }

  console.log(`Received message: "${message}"`);

  // Fallback: If Gemini API Key is missing, serve high-quality mock responses
  if (!GEMINI_API_KEY) {
    console.log("No GEMINI_API_KEY set. Operating in mock demo mode...");
    const msgLower = message.toLowerCase();
    let reply = "Hello! I am Shivang's AI Assistant. How can I help you today?";
    
    if (msgLower.includes("skill") || msgLower.includes("stack") || msgLower.includes("technology")) {
      reply = MOCK_ANSWERS.skills;
    } else if (msgLower.includes("experience") || msgLower.includes("work") || msgLower.includes("job") || msgLower.includes("history")) {
      reply = MOCK_ANSWERS.experience;
    } else if (msgLower.includes("project") || msgLower.includes("app") || msgLower.includes("build")) {
      reply = MOCK_ANSWERS.projects;
    } else if (msgLower.includes("contact") || msgLower.includes("email") || msgLower.includes("phone")) {
      reply = MOCK_ANSWERS.contact;
    } else if (msgLower.includes("cv") || msgLower.includes("resume")) {
      reply = MOCK_ANSWERS.resume;
    } else {
      reply = `I am running in local demo mode because the backend environment variables are not fully configured yet. I can answer questions about Shivang's **skills**, **experience**, **projects**, or **contact** details!`;
    }

    return res.json({ response: reply, demoMode: true });
  }

  // Real RAG implementation
  try {
    let vectorContext = "";
    
    // A. Query Qdrant (Vector DB)
    if (qdrantClient) {
      try {
        const queryEmbedding = await getEmbedding(message);
        if (queryEmbedding) {
          const searchResults = await qdrantClient.search(COLLECTION_NAME, {
            vector: queryEmbedding,
            limit: 3,
          });
          vectorContext = searchResults.map(r => r.payload.text).join('\n\n');
        }
      } catch (err) {
        console.warn("Qdrant query skipped or failed:", err.message);
      }
    }

    // B. Query Neo4j (Graph DB)
    let graphContext = "";
    if (neo4jDriver) {
      const session = neo4jDriver.session();
      try {
        const lowercaseQuery = message.toLowerCase();
        const entities = ["ascendion", "dmi", "quaeretech", "devgenesis", "student edventures", "loandepot", "heathrow", "upgrad", "dsm", "wallet", "timble", "swift", "swiftui", "uikit", "viper", "mvvm", "kmp"];
        const matchedEntities = entities.filter(e => lowercaseQuery.includes(e));

        if (matchedEntities.length > 0) {
          const matchedContexts = [];
          for (const ent of matchedEntities) {
            const cypherRes = await session.run(
              `MATCH (n)-[r]->(m) 
               WHERE toLower(n.name) CONTAINS $ent 
                  OR toLower(m.name) CONTAINS $ent 
                  OR toLower(n.title) CONTAINS $ent 
                  OR toLower(m.title) CONTAINS $ent
               RETURN labels(n) as ln, properties(n) as pn, type(r) as rel, labels(m) as lm, properties(m) as pm LIMIT 5`,
              { ent }
            );
            cypherRes.records.forEach(rec => {
              const pn = rec.get('pn');
              const pm = rec.get('pm');
              const rel = rec.get('rel');
              const ln = rec.get('ln')[0] || '';
              const lm = rec.get('lm')[0] || '';
              const nName = pn.name || pn.title || '';
              const mName = pm.name || pm.title || pm.description || '';
              matchedContexts.push(`Fact: (${ln}: ${nName}) -[:${rel}]-> (${lm}: ${mName})`);
            });
          }
          if (matchedContexts.length > 0) {
            graphContext = "Knowledge Graph structural facts retrieved:\n" + matchedContexts.join('\n');
          }
        }
      } catch (err) {
        console.warn("Neo4j query skipped or failed:", err.message);
      } finally {
        await session.close();
      }
    }

    // If both databases are unconfigured or empty, fallback to simple prompt engineering using basic cv metadata
    if (!vectorContext && !graphContext) {
      vectorContext = `Shivang Pandey is a Senior iOS Developer with 9+ years of experience. Stack: Swift, SwiftUI, UIKit, Combine, Objective-C, KMP. He worked at Ascendion (2024-Present) on loanDepot app, and DMI (2020-2024) on Heathrow App, upGrad, and DSM-5-TR. CV link is https://docs.google.com/document/d/1uXre0GSEdaMbVTZMQM-3qb9vHKEf6NxZ/.`;
    }

    // C. Invoke LangChain Orchestration
    const promptTemplate = PromptTemplate.fromTemplate(`You are Shivang Pandey's AI Portfolio Assistant, representing him to recruiters and developers.
Answer the user's question about him using the provided context. If you don't know the answer, say that you don't know, but encourage them to contact Shivang directly at shivang.pandey.dev@gmail.com.

Context from vector search:
{vectorContext}

{graphContext}

User Question: {question}

AI Assistant Answer (markdown format):`);

    const chain = RunnableSequence.from([
      promptTemplate,
      langchainModel,
      new StringOutputParser(),
    ]);

    const result = await chain.invoke({
      vectorContext,
      graphContext,
      question: message
    });

    res.json({ response: result, demoMode: false });
  } catch (err) {
    console.error("Error processing RAG query:", err);
    res.status(500).json({ error: "Failed to process RAG chat request." });
  }
});

// Server listener
app.listen(PORT, () => {
  console.log(`RAG portfolio server listening on port ${PORT}`);
});
