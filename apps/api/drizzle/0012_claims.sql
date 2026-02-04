CREATE TABLE claim_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method text NOT NULL CHECK (method IN ('whatsapp_otp', 'cnpj_whatsapp')),
  status text NOT NULL CHECK (status IN ('pending', 'verified', 'rejected', 'cancelled')),
  requested_phone text,
  serp_phone text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  verified_at timestamp with time zone,
  rejected_at timestamp with time zone,
  attempts_count integer NOT NULL DEFAULT 0,
  last_attempt_at timestamp with time zone,
  notes text
);

CREATE INDEX idx_claim_requests_company_status ON claim_requests(company_id, status);
CREATE INDEX idx_claim_requests_user_status ON claim_requests(user_id, status);
CREATE INDEX idx_claim_requests_created_at ON claim_requests(created_at);

CREATE TABLE company_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('whatsapp', 'phone')),
  value text NOT NULL,
  source text NOT NULL CHECK (source IN ('serpapi', 'owner')),
  status text NOT NULL CHECK (status IN ('unverified', 'verified')),
  verified_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_company_channels_company_type ON company_channels(company_id, type);
CREATE INDEX idx_company_channels_type_value ON company_channels(type, value);
