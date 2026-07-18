const ENV_DEPLOY_PERMISSIONS = {
  OWNER: ["dev", "staging", "production"],
  DEPLOYER: ["dev", "staging"],
  VIEWER: [],
};

const ACTIONS = {
  view: ["OWNER", "DEPLOYER", "VIEWER"],
  deploy: ["OWNER", "DEPLOYER"],
  rollback: ["OWNER", "DEPLOYER"],
  lockDeploys: ["OWNER"],
  editSecrets: ["OWNER", "DEPLOYER"],
  editFlags: ["OWNER", "DEPLOYER"],
};

export function canPerform(role, action) {
  const allowed = ACTIONS[action] ?? [];
  return allowed.includes(role);
}

export function canDeployToEnvironment(role, envSlug) {
  const allowedEnvs = ENV_DEPLOY_PERMISSIONS[role] ?? [];
  return allowedEnvs.includes(envSlug);
}
