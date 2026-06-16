require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { QdrantClient } = require('@qdrant/js-client-rest');
const neo4j = require('neo4j-driver');

// Verify environment variables
const {
  GEMINI_API_KEY,
  QDRANT_URL,
  QDRANT_API_KEY,
  NEO4J_URI,
  NEO4J_USERNAME,
  NEO4J_PASSWORD
} = process.env;

if (!GEMINI_API_KEY) {
  console.error("Error: GEMINI_API_KEY is not defined in the environment.");
  process.exit(1);
}

// 1. Initialize Clients
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const embeddingModel = genAI.getGenerativeModel({ model: 'text-embedding-004' });

let qdrantClient = null;
if (QDRANT_URL) {
  qdrantClient = new QdrantClient({
    url: QDRANT_URL,
    apiKey: QDRANT_API_KEY || undefined,
  });
} else {
  console.warn("Warning: QDRANT_URL is not set. Vector ingestion will be skipped.");
}

let neo4jDriver = null;
if (NEO4J_URI) {
  neo4jDriver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USERNAME || 'neo4j', NEO4J_PASSWORD || 'password123')
  );
} else {
  console.warn("Warning: NEO4J_URI is not set. Graph ingestion will be skipped.");
}

const COLLECTION_NAME = "shivang_cv_collection";

// Helper function to generate embeddings
async function getEmbedding(text) {
  const result = await embeddingModel.embedContent(text);
  return result.embedding.values;
}

// Ingestion function
async function runIngestion() {
  console.log("Starting CV Ingestion Process...");

  // Load cv_data.md
  const cvPath = path.join(__dirname, 'cv_data.md');
  if (!fs.existsSync(cvPath)) {
    console.error(`Error: cv_data.md file not found at ${cvPath}`);
    return;
  }
  const cvContent = fs.readFileSync(cvPath, 'utf8');

  // A. Ingest into Qdrant (Vector Store)
  if (qdrantClient) {
    try {
      console.log("Connecting to Qdrant...");
      
      // Check if collection exists, if so recreate it to clear stale data
      const collectionsResponse = await qdrantClient.getCollections();
      const collectionExists = collectionsResponse.collections.some(c => c.name === COLLECTION_NAME);

      if (collectionExists) {
        console.log(`Re-creating collection: ${COLLECTION_NAME}...`);
        await qdrantClient.deleteCollection(COLLECTION_NAME);
      }

      await qdrantClient.createCollection(COLLECTION_NAME, {
        vectors: {
          size: 768, // text-embedding-004 outputs 768 dimensions
          distance: "Cosine",
        }
      });

      // Split CV into chunks (based on markdown headings or double newlines)
      const rawChunks = cvContent.split(/(?=## )/g);
      const chunks = rawChunks.map(c => c.trim()).filter(c => c.length > 0);

      console.log(`Generating embeddings for ${chunks.length} chunks...`);
      const points = [];

      for (let i = 0; i < chunks.length; i++) {
        const text = chunks[i];
        const vector = await getEmbedding(text);
        points.push({
          id: i + 1,
          vector,
          payload: {
            text,
            source: 'cv_data.md',
            section: text.split('\n')[0].replace('## ', '')
          }
        });
      }

      await qdrantClient.upsert(COLLECTION_NAME, {
        wait: true,
        points
      });
      console.log(`Successfully ingested ${points.length} vectors into Qdrant collection: "${COLLECTION_NAME}"`);

    } catch (err) {
      console.error("Qdrant Ingestion Error:", err);
    }
  }

  // B. Ingest into Neo4j (Graph Database)
  if (neo4jDriver) {
    const session = neo4jDriver.session();
    try {
      console.log("Connecting to Neo4j and building knowledge graph...");

      // Clear existing data to be idempotent
      await session.run("MATCH (n) DETACH DELETE n");

      // Define standard Cypher statements to insert nodes & relationships
      const cypherStatements = [
        // Create Shivang
        `CREATE (p:Person {name: "Shivang Pandey", title: "Senior iOS Engineer", email: "shivang.pandey.dev@gmail.com", phone: "+91-9717779622", linkedin: "https://www.linkedin.com/in/shivang-pandey-dev", github: "https://github.com/pandeyshivang"})`,
        
        // Companies
        `CREATE (c1:Company {name: "Ascendion Engineering Private Limited", industry: "FinTech / Mortgage"})`,
        `CREATE (c2:Company {name: "DMI (Digital Management, LLC)", industry: "Digital Solutions / Multi-sector"})`,
        `CREATE (c3:Company {name: "Quaeretech Private Limited", industry: "Software Development"})`,
        `CREATE (c4:Company {name: "DevGenesis Private Limited", industry: "Blockchain / Crypto"})`,
        `CREATE (c5:Company {name: "Student Edventures Private Limited", industry: "Enterprise SaaS"})`,

        // Roles
        `CREATE (r1:Role {title: "Senior iOS Developer", company: "Ascendion Engineering Private Limited"})`,
        `CREATE (r2:Role {title: "Senior iOS Engineer", company: "DMI (Digital Management, LLC)"})`,
        `CREATE (r3:Role {title: "iOS Developer", company: "Quaeretech Private Limited"})`,
        `CREATE (r4:Role {title: "iOS Developer", company: "DevGenesis Private Limited"})`,
        `CREATE (r5:Role {title: "Junior iOS Developer", company: "Student Edventures Private Limited"})`,

        // Connect Person to Roles and Companies
        `MATCH (p:Person), (r1:Role {title: "Senior iOS Developer"}), (c1:Company {name: "Ascendion Engineering Private Limited"})
         CREATE (p)-[:HELD_ROLE]->(r1), (r1)-[:AT_COMPANY {duration: "August 2024 - Present"}]->(c1), (p)-[:WORKED_AT {duration: "August 2024 - Present"}]->(c1)`,
        
        `MATCH (p:Person), (r2:Role {title: "Senior iOS Engineer"}), (c2:Company {name: "DMI (Digital Management, LLC)"})
         CREATE (p)-[:HELD_ROLE]->(r2), (r2)-[:AT_COMPANY {duration: "March 2020 - August 2024"}]->(c2), (p)-[:WORKED_AT {duration: "March 2020 - August 2024"}]->(c2)`,

        `MATCH (p:Person), (r3:Role {title: "iOS Developer", company: "Quaeretech Private Limited"}), (c3:Company {name: "Quaeretech Private Limited"})
         CREATE (p)-[:HELD_ROLE]->(r3), (r3)-[:AT_COMPANY {duration: "May 2019 - February 2020"}]->(c3), (p)-[:WORKED_AT {duration: "May 2019 - February 2020"}]->(c3)`,

        `MATCH (p:Person), (r4:Role {title: "iOS Developer", company: "DevGenesis Private Limited"}), (c4:Company {name: "DevGenesis Private Limited"})
         CREATE (p)-[:HELD_ROLE]->(r4), (r4)-[:AT_COMPANY {duration: "October 2017 - November 2018"}]->(c4), (p)-[:WORKED_AT {duration: "October 2017 - November 2018"}]->(c4)`,

        `MATCH (p:Person), (r5:Role {title: "Junior iOS Developer"}), (c5:Company {name: "Student Edventures Private Limited"})
         CREATE (p)-[:HELD_ROLE]->(r5), (r5)-[:AT_COMPANY {duration: "February 2016 - October 2017"}]->(c5), (p)-[:WORKED_AT {duration: "February 2016 - October 2017"}]->(c5)`,

        // Projects
        `CREATE (pr1:Project {name: "loanDepot Mobile App", platform: "iOS", description: "Mortgage payments, AutoPay setup"})`,
        `CREATE (pr2:Project {name: "LHR London Heathrow Airport App", platform: "iOS", description: "Travel companion, live flight status, terminal mapping"})`,
        `CREATE (pr3:Project {name: "upGrad Learning App", platform: "iOS", description: "EdTech educational portal"})`,
        `CREATE (pr4:Project {name: "DSM-5-TR Diagnostic Criteria App", platform: "iOS", description: "Healthcare psychiatric medical reference"})`,
        `CREATE (pr5:Project {name: "UDYAMI App", platform: "iOS", description: "Skill development and employment hub"})`,
        `CREATE (pr6:Project {name: "CashBag / BizWay", platform: "iOS", description: "Utility rewards and agricultural administration"})`,
        `CREATE (pr7:Project {name: "ERC20 Wallet & CryptCoin", platform: "iOS", description: "Secure Ethereum blockchain wallet"})`,
        `CREATE (pr8:Project {name: "Timble Paperless Attendance", platform: "iOS", description: "Enterprise SaaS attendance manager"})`,

        // Connect Companies and Projects
        `MATCH (c1:Company {name: "Ascendion Engineering Private Limited"}), (pr1:Project {name: "loanDepot Mobile App"}) CREATE (c1)-[:DEVELOPED_PROJECT]->(pr1)`,
        `MATCH (c2:Company {name: "DMI (Digital Management, LLC)"}), (pr2:Project {name: "LHR London Heathrow Airport App"}) CREATE (c2)-[:DEVELOPED_PROJECT]->(pr2)`,
        `MATCH (c2:Company {name: "DMI (Digital Management, LLC)"}), (pr3:Project {name: "upGrad Learning App"}) CREATE (c2)-[:DEVELOPED_PROJECT]->(pr3)`,
        `MATCH (c2:Company {name: "DMI (Digital Management, LLC)"}), (pr4:Project {name: "DSM-5-TR Diagnostic Criteria App"}) CREATE (c2)-[:DEVELOPED_PROJECT]->(pr4)`,
        `MATCH (c3:Company {name: "Quaeretech Private Limited"}), (pr5:Project {name: "UDYAMI App"}) CREATE (c3)-[:DEVELOPED_PROJECT]->(pr5)`,
        `MATCH (c3:Company {name: "Quaeretech Private Limited"}), (pr6:Project {name: "CashBag / BizWay"}) CREATE (c3)-[:DEVELOPED_PROJECT]->(pr6)`,
        `MATCH (c4:Company {name: "DevGenesis Private Limited"}), (pr7:Project {name: "ERC20 Wallet & CryptCoin"}) CREATE (c4)-[:DEVELOPED_PROJECT]->(pr7)`,
        `MATCH (c5:Company {name: "Student Edventures Private Limited"}), (pr8:Project {name: "Timble Paperless Attendance"}) CREATE (c5)-[:DEVELOPED_PROJECT]->(pr8)`,

        // Skills
        `CREATE (s1:Skill {name: "Swift", category: "Language"})`,
        `CREATE (s2:Skill {name: "SwiftUI", category: "UI"})`,
        `CREATE (s3:Skill {name: "UIKit", category: "UI"})`,
        `CREATE (s4:Skill {name: "Objective-C", category: "Language"})`,
        `CREATE (s5:Skill {name: "Combine", category: "Framework"})`,
        `CREATE (s6:Skill {name: "RxSwift", category: "Framework"})`,
        `CREATE (s7:Skill {name: "Kotlin Multiplatform (KMP)", category: "Cross-platform"})`,
        `CREATE (s8:Skill {name: "Realm Database", category: "Database"})`,
        `CREATE (s9:Skill {name: "CoreData", category: "Database"})`,
        `CREATE (s10:Skill {name: "Fastlane", category: "CI/CD"})`,
        `CREATE (s11:Skill {name: "GitHub Actions", category: "CI/CD"})`,
        `CREATE (s12:Skill {name: "VIPER", category: "Architecture"})`,
        `CREATE (s13:Skill {name: "MVVM", category: "Architecture"})`,
        `CREATE (s14:Skill {name: "GraphQL", category: "Protocol"})`,

        // Connect Person to Skills
        `MATCH (p:Person), (s:Skill) CREATE (p)-[:HAS_SKILL]->(s)`,

        // Connect Projects to Skills
        `MATCH (pr1:Project {name: "loanDepot Mobile App"}), (s1:Skill {name: "Swift"}), (s2:Skill {name: "SwiftUI"}), (s6:Skill {name: "RxSwift"}), (s13:Skill {name: "MVVM"})
         CREATE (pr1)-[:USES_SKILL]->(s1), (pr1)-[:USES_SKILL]->(s2), (pr1)-[:USES_SKILL]->(s6), (pr1)-[:USES_SKILL]->(s13)`,
        `MATCH (pr2:Project {name: "LHR London Heathrow Airport App"}), (s1:Skill {name: "Swift"}), (s3:Skill {name: "UIKit"}), (s10:Skill {name: "Fastlane"})
         CREATE (pr2)-[:USES_SKILL]->(s1), (pr2)-[:USES_SKILL]->(s3), (pr2)-[:USES_SKILL]->(s10)`,
        `MATCH (pr3:Project {name: "upGrad Learning App"}), (s1:Skill {name: "Swift"}), (s12:Skill {name: "VIPER"})
         CREATE (pr3)-[:USES_SKILL]->(s1), (pr3)-[:USES_SKILL]->(s12)`,
        `MATCH (pr4:Project {name: "DSM-5-TR Diagnostic Criteria App"}), (s2:Skill {name: "SwiftUI"}), (s1:Skill {name: "Swift"})
         CREATE (pr4)-[:USES_SKILL]->(s2), (pr4)-[:USES_SKILL]->(s1)`,
        `MATCH (pr7:Project {name: "ERC20 Wallet & CryptCoin"}), (s1:Skill {name: "Swift"}), (s4:Skill {name: "Objective-C"})
         CREATE (pr7)-[:USES_SKILL]->(s1), (pr7)-[:USES_SKILL]->(s4)`
      ];

      for (const statement of cypherStatements) {
        await session.run(statement);
      }

      console.log("Successfully constructed and published Knowledge Graph in Neo4j.");
    } catch (err) {
      console.error("Neo4j Ingestion Error:", err);
    } finally {
      await session.close();
    }
  }

  // C. Close Drivers
  if (neo4jDriver) {
    await neo4jDriver.close();
  }
  console.log("Ingestion process completed successfully.");
}

runIngestion();
