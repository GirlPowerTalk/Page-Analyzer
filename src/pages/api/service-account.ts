// supabase/api/service-account.ts
import type { NextApiRequest, NextApiResponse } from "next";
// ✅ Correct path to your admin client:
import { supabaseAdmin } from "../../integrations/supabase/admin";
import { google } from "googleapis";
import { GoogleAuth } from "google-auth-library";
import crypto from "crypto";

type ResponseData = {
  message?: string;
  error?: string;
  serviceAccountEmail?: string;
};

export default async function handler(
  
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  console.log('Service account API hit', req.method, req.body);
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "userId required" });
  }

  try {
    console.log("[API] Service-account request for:", userId);

    // 1️⃣ Fetch the user to ensure email is verified
    const { data: userData, error: userErr } =
      await supabaseAdmin.auth.admin.getUserById(userId);
    if (userErr) throw userErr;

    const user = userData.user;
    if (!user?.email_confirmed_at) {
      console.warn("[API] Email not verified for:", userId);
      return res.status(400).json({ error: "Email not verified yet." });
    }

    const userEmail = user.email!;
    const projectId = process.env.GOOGLE_PROJECT_ID!;
    const emailHash = crypto
      .createHash("sha256")
      .update(userEmail)
      .digest("hex")
      .slice(0, 16);
    const serviceAccountId = `user-${emailHash}`;
    const serviceAccountEmail = `${serviceAccountId}@${projectId}.iam.gserviceaccount.com`;

    console.log("[API] Creating/using service account:", serviceAccountEmail);

    // 2️⃣ Authenticate with Google
    const auth = new GoogleAuth({
      credentials: JSON.parse(
        Buffer.from(
          process.env.SERVICE_ACCOUNT_PRIVATE_KEY_BASE64!,
          "base64"
        ).toString("utf8")
      ),
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    const iam = google.iam({ version: "v1", auth });

    // 3️⃣ Create the service account if it doesn't exist
    try {
      await iam.projects.serviceAccounts.create({
        name: `projects/${projectId}`,
        requestBody: {
          accountId: serviceAccountId,
          serviceAccount: {
            displayName: `User Service Account for ${userEmail}`,
          },
        },
      });
      console.log("[API] Service account created");
    } catch (err: any) {
      if (err?.errors?.[0]?.reason === "alreadyExists") {
        console.log("[API] Service account already exists");
      } else {
        console.error("[API] IAM create error:", err);
        throw err;
      }
    }

    // 4️⃣ Create a key for that service account
    const keyResponse = await iam.projects.serviceAccounts.keys.create({
      name: `projects/${projectId}/serviceAccounts/${serviceAccountEmail}`,
      requestBody: { privateKeyType: "TYPE_GOOGLE_CREDENTIALS_FILE" },
    });

    const privateKeyJson = Buffer.from(
      keyResponse.data.privateKeyData!,
      "base64"
    ).toString("utf8");

    // 5️⃣ Store in Supabase
    const { error: dbError } = await supabaseAdmin
      .from("user_service_accounts")
      .upsert(
        {
          user_id: userId,
          client_email: serviceAccountEmail,
          private_key: privateKeyJson,
        },
        { onConflict: "user_id" }
      );

    if (dbError) throw dbError;

    console.log("[API] Service account saved for user:", userId);
    return res.status(200).json({
      message: "Service account created successfully",
      serviceAccountEmail,
    });
  } catch (err: any) {
    console.error("[API] Service account error:", err);
    return res.status(500).json({ error: err.message });
  }
}
