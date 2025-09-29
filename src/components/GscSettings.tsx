
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { 
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger 
} from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Check, Shield, Globe, Trash2 } from "lucide-react";

const SERVICE_ACCOUNT_EMAIL = "gsc-141@gsc-saas-458015.iam.gserviceaccount.com";

const GscSettings = () => {
  const { user } = useAuth();
  const [serviceAccountKey, setServiceAccountKey] = useState("");
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifiedDomains, setVerifiedDomains] = useState<{ id: string; domain: string }[]>([]);
  const [newDomain, setNewDomain] = useState("");

  useEffect(() => {
    const checkExistingCredentials = async () => {
      if (!user) return;
      
      try {
        const { data, error } = await supabase
          .from('gsc_credentials')
          .select('service_account_key')
          .eq('user_id', user.id)
          .maybeSingle();
          
        if (data && !error) {
          setHasStoredKey(true);
        }
      } catch (error) {
        console.error("Error checking credentials:", error);
      }
    };
    
    checkExistingCredentials();
  }, [user]);

  useEffect(() => {
    const fetchVerifiedDomains = async () => {
      if (!user) return;
      
      try {
        const { data, error } = await supabase
          .from('verified_domains')
          .select('id, domain')
          .order('created_at', { ascending: false });
          
        if (error) throw error;
        setVerifiedDomains(data || []);
      } catch (error) {
        console.error("Error fetching verified domains:", error);
        toast.error("Failed to fetch verified domains");
      }
    };
    
    fetchVerifiedDomains();
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let parsedKey;
      try {
        parsedKey = JSON.parse(serviceAccountKey);
      } catch (parseError) {
        toast.error("Invalid JSON format. Please check your service account key");
        setLoading(false);
        return;
      }
      
      if (!parsedKey.private_key) {
        toast.error("Service account key missing required fields");
        setLoading(false);
        return;
      }
      
      const { error } = await supabase
        .from('gsc_credentials')
        .upsert({ 
          service_account_key: parsedKey,
          user_id: user?.id
        });

      if (error) throw error;
      
      toast.success("GSC credentials saved successfully!");
      setHasStoredKey(true);
      setServiceAccountKey("");
    } catch (error: any) {
      toast.error(error.message || "Failed to save credentials");
    } finally {
      setLoading(false);
    }
  };

  const handleAddDomain = async () => {
    if (!newDomain) {
      toast.error("Please enter a domain");
      return;
    }
    
    if (!user) {
      toast.error("You must be logged in to add a domain");
      return;
    }

    try {
      let domain = newDomain.trim().toLowerCase();
      // Remove protocol if present
      domain = domain.replace(/^(https?:\/\/)?(www\.)?/, '');
      
      const { error } = await supabase
        .from('verified_domains')
        .insert({ 
          domain,
          user_id: user.id
        });

      if (error) throw error;
      
      toast.success(`Domain ${domain} has been added`);
      setNewDomain("");
      
      // Refresh the list
      const { data: updatedDomains } = await supabase
        .from('verified_domains')
        .select('id, domain')
        .order('created_at', { ascending: false });
        
      setVerifiedDomains(updatedDomains || []);
    } catch (error: any) {
      console.error("Error adding domain:", error);
      toast.error(error.message || "Failed to add domain");
    }
  };

  const handleDeleteDomain = async (id: string) => {
    try {
      const { error } = await supabase
        .from('verified_domains')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setVerifiedDomains(prev => prev.filter(d => d.id !== id));
      toast.success("Domain removed successfully");
    } catch (error) {
      console.error("Error deleting domain:", error);
      toast.error("Failed to remove domain");
    }
  };

  return (
    <div className="space-y-4">
      {/* <Alert variant="default" className="bg-blue-50 border-blue-200">
        <AlertCircle className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-800">
          Add this service account email as an Owner in your Google Search Console properties:
          <p className="mt-2 font-mono text-sm break-all">
            {SERVICE_ACCOUNT_EMAIL}
          </p>
        </AlertDescription>
      </Alert> */}

      {hasStoredKey ? (
        <Alert className="bg-green-50 text-green-800 border-green-200">
          <Check className="h-4 w-4" />
          <AlertDescription>
            Service account credentials are saved
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <Accordion type="single" collapsible className="mb-4">
            <AccordionItem value="instructions">
              <AccordionTrigger>How to add the service account to Google Search Console</AccordionTrigger>
              <AccordionContent>
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                  <li>Go to <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">Google Search Console</a></li>
                  <li>Select the property you want to analyze</li>
                  <li>Click on Settings (gear icon) in the left sidebar</li>
                  <li>Click on "Users and permissions"</li>
                  <li>Click "Add User"</li>
                  <li>Enter the service account email shown above</li>
                  <li>Select "Owner" as the permission level</li>
                  <li>Click "Add"</li>
                  <li>Upload your service account JSON key below</li>
                </ol>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Textarea
                value={serviceAccountKey}
                onChange={(e) => setServiceAccountKey(e.target.value)}
                placeholder="Paste your service account JSON key here"
                className="min-h-[100px] font-mono text-sm"
                required
              />
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save Credentials"}
            </Button>
          </form>
        </>
      )}
      
      {/* Domain Management Section - Always visible */}
      <div className="bg-gray-50 p-4 rounded-md mt-6">
        <h3 className="text-lg font-medium mb-3">Manage Domains</h3>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="Enter domain (e.g., example.com)"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              className="flex-1"
            />
            <Button onClick={handleAddDomain}>
              Add Domain
            </Button>
          </div>
          
          {verifiedDomains.length > 0 ? (
            <div className="space-y-2">
              <h4 className="font-medium">Your Domains:</h4>
              <ul className="divide-y">
                {verifiedDomains.map((domain) => (
                  <li key={domain.id} className="py-2 flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-green-600" />
                      {domain.domain}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteDomain(domain.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-gray-500 text-sm italic">No domains added yet.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default GscSettings;
