import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import { GoogleAuth } from "google-auth-library";
import crypto from "crypto";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SERVICE_ROLE_KEY_BASE64 = process.env.SERVICE_ACCOUNT_PRIVATE_KEY_BASE64;
const GOOGLE_PROJECT_ID = process.env.GOOGLE_PROJECT_ID;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SERVICE_ROLE_KEY_BASE64 || !GOOGLE_PROJECT_ID) {
  throw new Error("Missing required environment variables!");
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const SERVICE_ROLE_KEY = JSON.parse(Buffer.from(SERVICE_ROLE_KEY_BASE64, "base64").toString("utf8"));

const app = express();
app.use(cors());
app.use(bodyParser.json());

// --------------------------
// Helper: Create Google Service Account
// --------------------------
async function createGoogleServiceAccount(userId, userEmail) {
  const emailHash = crypto.createHash("sha256").update(userEmail).digest("hex").slice(0, 16);
  const serviceAccountId = `user-${emailHash}`;
  const serviceAccountEmail = `${serviceAccountId}@${GOOGLE_PROJECT_ID}.iam.gserviceaccount.com`;

  console.log(`[INFO] Creating service account for user: ${userEmail}`);

  const auth = new GoogleAuth({
    credentials: SERVICE_ROLE_KEY,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const iam = google.iam({ version: "v1", auth });

  // Create service account if it doesn't exist
  try {
    await iam.projects.serviceAccounts.create({
      name: `projects/${GOOGLE_PROJECT_ID}`,
      requestBody: {
        accountId: serviceAccountId,
        serviceAccount: { displayName: `User Service Account for ${userEmail}` },
      },
    });
    console.log(`[INFO] Service account ${serviceAccountEmail} created.`);
  } catch(err)  {
    if (err?.errors?.[0]?.reason === "alreadyExists") {
      console.log(`[INFO] Service account already exists, continuing to key creation.`);
    } else {
      console.error(`[ERROR] Failed to create service account:`, err);
      throw err;
    }
  }

 // 0️⃣ Check Supabase for existing key first
const { data: existing, error: dbError } = await supabaseAdmin
  .from("user_service_accounts")
  .select("*")
  .eq("user_id", userId)
  .single();

let privateKeyJson;

if (existing && existing.private_key) {
  // Reuse the existing key from Supabase
  privateKeyJson = existing.private_key;
  console.log(`[INFO] Reusing existing service account key for ${userEmail}`);
} else {
  // 1️⃣ No key exists, create a new key
  const keyResponse = await iam.projects.serviceAccounts.keys.create({
    name: `projects/${GOOGLE_PROJECT_ID}/serviceAccounts/${serviceAccountEmail}`,
    requestBody: { privateKeyType: "TYPE_GOOGLE_CREDENTIALS_FILE" },
  });

  privateKeyJson = Buffer.from(keyResponse.data.privateKeyData, "base64").toString("utf8");

  // 2️⃣ Save the new key in Supabase
  const { error: upsertError } = await supabaseAdmin
    .from("user_service_accounts")
    .upsert(
      { user_id: userId, client_email: serviceAccountEmail, private_key: privateKeyJson },
      { onConflict: "user_id" }
    );

  if (upsertError) {
    console.error(`[ERROR] Failed to save service account key:`, upsertError);
    throw upsertError;
  }

  console.log(`[INFO] New service account key created and saved for ${userEmail}`);
}

return serviceAccountEmail;
}

// --------------------------
// Signup Endpoint
// --------------------------
app.post("/api/signup", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    console.log(`[INFO] Signup request for email: ${email}`);

    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const userExists = existingUsers.users.find(u => u.email === email);

    if (userExists) {
      const msg = userExists.email_confirmed_at
        ? "Account already exists and verified. Please sign in."
        : "Account exists but not verified. Check your email.";
      console.log(`[WARN] Signup failed for ${email}: ${msg}`);
      return res.status(400).json({ error: msg });
    }

    const { data, error: supaError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      returning: "representation",
    });

    if (supaError || !data?.user) throw supaError;

    console.log(`[INFO] Signup successful for ${email}, userId: ${data.user.id}`);
    return res.status(200).json({
      message: "Signup successful! Please verify your email before signing in.",
      userId: data.user.id,
    });
  } catch {
    console.error("[ERROR] Signup error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// --------------------------
// Service Account Creation Endpoint
// --------------------------
app.post("/api/service-account", async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "userId required" });

    console.log(`[INFO] Service account request for userId: ${userId}`);

    const { data: userData, error: userErr } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (userErr) throw userErr;

    if (!userData.user?.email_confirmed_at) {
      console.log(`[WARN] Email not verified for userId: ${userId}`);
      return res.status(400).json({ error: "Email not verified yet" });
    }

    const serviceAccountEmail = await createGoogleServiceAccount(userId, userData.user.email);
    return res.status(200).json({
      message: "Service account created successfully",
      serviceAccountEmail,
    });
  } catch(err) {
    console.error("[ERROR] Service account error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// --------------------------
// Start Server
// --------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[INFO] Server running on http://localhost:${PORT}`));
