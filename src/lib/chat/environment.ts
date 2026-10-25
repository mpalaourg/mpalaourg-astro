export interface ChatEnvironmentEnv {
  CHAT_ENVIRONMENT?: string;
}

// Only an explicit production setting opts into production resources.
// Missing, misspelled or unknown values stay on development resources.
export function chatEnvironment(env?: ChatEnvironmentEnv): 'development' | 'production' {
  return env?.CHAT_ENVIRONMENT === 'production' ? 'production' : 'development';
}
