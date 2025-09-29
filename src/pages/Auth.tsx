import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;


const Auth = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  /** ---------- SIGN-UP ---------- */
 const handleSignup = async (e: React.FormEvent) => {
  e.preventDefault();
  setLoading(true);

  try {
    const { error } = await supabase.auth.signUp({ email, password });

    if (error) {
      // Handle existing user
      if (error.message.includes("already registered")) {
        toast.error("Email already exists. Please sign in or check your inbox for verification.");
      } else {
        toast.error(error.message);
      }
      return;
    }

    // New user signed up successfully
    toast.success(
      "Signup successful! Check your inbox and click the verification link before signing in."
    );
  } catch (err: any) {
    toast.error(err.message || "Signup error");
  } finally {
    setLoading(false);
  }
};


  /** ---------- SIGN-IN (verify first) ---------- */
  const handleSignIn = async (e: React.FormEvent) => {
  e.preventDefault();
  setLoading(true);

  try {
    // 1️⃣ Sign in with password
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    // 2️⃣ Re-fetch user to get latest email confirmation status
    const { data: fresh } = await supabase.auth.getUser();
    const user = fresh.user;

    if (!user?.email_confirmed_at) {
      await supabase.auth.signOut(); // Avoid session with unverified email
      toast.error("Please verify your email before signing in.");
      return;
    }

    // 3️⃣ Create service account for verified user
   // After sign-in and email verification
try {
  const res = await fetch(`${API_BASE_URL}/api/service-account`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: user.id }),
  });
  let data;
try {
  data = await res.json();
} catch {
  data = {};
}

  if (res.ok) {
    console.log("Service account created:", data.serviceAccountEmail);
    toast.success("Service account created successfully!");
  } else {
    console.warn("Service account creation failed:", data.error);
    toast.error(data.error || "Service account creation failed");
  }
} catch (svcErr) {
  console.error("Service account creation failed:", svcErr);
  toast.error("Service account creation failed");
}


    // 4️⃣ Sign-in success
    toast.success("Successfully signed in!");
    navigate("/");

  } catch (err: any) {
    toast.error(err.message || "Sign in error");
  } finally {
    setLoading(false);
  }
};


  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Welcome to Page Analyzer</CardTitle>
          <CardDescription>Sign in or create a new account</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <Input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <Input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4">
                <Input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <Input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Signing up..." : "Sign Up"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
