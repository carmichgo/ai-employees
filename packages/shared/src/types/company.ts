export interface CompanyCreateInput {
  name: string;
  slug: string;
}

export interface CompanySettings {
  anthropicApiKey?: string;
  openaiApiKey?: string;
  defaultModel?: string;
  domain?: string;
}
