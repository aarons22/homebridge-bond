# GitHub Workflows

This directory contains automated workflows for the homebridge-bond project.

## Workflows

### 1. Build and Lint (`build.yml`)
- **Trigger:** On every push and pull request
- **Purpose:** Validates code quality and ensures the project builds successfully
- **Actions:**
  - Runs linting
  - Builds the project
  - Runs tests
  - Tests across multiple Node.js versions (10.x, 12.x, 14.x)

### 2. Version Bump (`version-bump.yml`)
- **Trigger:** Manual (workflow_dispatch)
- **Purpose:** Creates a pull request with a version bump
- **How to use:**
  1. Go to the "Actions" tab in GitHub
  2. Select "Version Bump" workflow
  3. Click "Run workflow"
  4. Choose version bump type (patch/minor/major/prerelease) or enter a custom version
  5. Click "Run workflow"
- **What it does:**
  - Updates the version in `package.json`
  - Creates a new branch
  - Opens a pull request with the version change
  - Labels the PR appropriately

### 3. Release (`release.yml`)
- **Trigger:** Automatic when `package.json` changes are merged to main/master
- **Purpose:** Publishes to npm and creates a GitHub release
- **What it does:**
  1. **Check Version:** Detects if the version in package.json actually changed
  2. **Publish to npm:** 
     - Installs dependencies
     - Builds the project
     - Runs tests
     - Publishes to npm registry
  3. **Create GitHub Release:**
     - Generates release notes from commits since last tag
     - Creates a new GitHub release
     - Tags the release with the version number

## Setup Required

### NPM Trusted Publishing (Recommended)

The workflows use **OIDC-based trusted publishing** - the most secure method that doesn't require managing tokens!

**Setup steps:**

1. **Configure trusted publisher on npmjs.com:**
   - Log in to [npmjs.com](https://www.npmjs.com)
   - Go to the `homebridge-bond` package → Settings
   - Scroll to "Trusted Publishers" section
   - Click "Select your publisher" → Choose **GitHub Actions**
   - Configure:
     - **Organization or user:** `aarons22`
     - **Repository:** `homebridge-bond`
     - **Workflow filename:** `release.yml` (exact match required!)
     - **Environment name:** Leave blank (optional)
   - Save the configuration

2. **That's it!** The workflow already has the required `id-token: write` permission.

**Benefits:**
- ✅ No tokens to manage or rotate
- ✅ No expiration - works indefinitely
- ✅ More secure (short-lived, workflow-specific credentials)
- ✅ Automatic provenance generation for package verification
- ✅ Recommended by npm and OpenSSF

### Optional: Restrict Token Access (Maximum Security)

Once trusted publishing works, enhance security:

1. Go to package Settings → Publishing access
2. Select "Require two-factor authentication and disallow tokens"
3. Save - now only trusted publishing can publish (more secure!)

### Fallback: NPM Token (Not Recommended)

<details>
<summary>Click here if you need to use tokens instead</summary>

> **⚠️ Warning:** Tokens expire after 90 days and require periodic renewal. Trusted publishing is strongly recommended.

1. **Create an npm access token:**
   - Log in to [npmjs.com](https://www.npmjs.com)
   - Go to your profile → Access Tokens
   - Click "Generate New Token" → "Granular Access Token"
   - Configure:
     - **Token name:** `GitHub Actions - homebridge-bond`
     - **Expiration:** 90 days (maximum)
     - **Packages:** Select `homebridge-bond`
     - **Permissions:** Read and write
   - Copy the token

2. **Add to GitHub Secrets:**
   - Repository → Settings → Secrets → Actions
   - New secret: `NPM_TOKEN`
   - Paste token value

3. **Update the workflow:**
   - Uncomment the `NODE_AUTH_TOKEN` line in [release.yml](.github/workflows/release.yml)

4. **Set expiration reminder** for 85 days

</details>

### Permissions
The workflows use the default `GITHUB_TOKEN` which is automatically provided by GitHub Actions. No additional setup needed for GitHub permissions.

## Release Process

### Standard Release Flow

1. **Bump Version:**
   - Trigger the "Version Bump" workflow manually
   - Select version type (patch for bug fixes, minor for new features, major for breaking changes)
   - Review the generated PR

2. **Review & Merge:**
   - Review the version bump PR
   - Ensure all checks pass
   - Merge the PR

3. **Automatic Release:**
   - The "Release" workflow automatically triggers
   - Package is published to npm
   - GitHub release is created with auto-generated release notes

### Custom Version Release

If you need a specific version (e.g., `3.3.0-beta.1`):
1. Use the "Custom version" input in the Version Bump workflow
2. Enter the exact version number
3. Follow the same review and merge process
**Check if token has expired** (granular tokens expire after 90 days)
- Verify the token has publish permissions for the `homebridge-bond` package
- Ensure the token is a granular access token, not a classic token (which have been revoked)

- **Pre-releases:** Use versions like `3.3.0-beta.1` or `3.3.0-rc.1` - these will be marked as pre-releases on GitHub
- **Emergency fixes:** You can manually edit package.json and push directly, but using the workflow is recommended for consistency
- **Failed releases:** If npm publish fails, fix the issue and re-run the workflow from the Actions tab
- **Release notes:** Edit the GitHub release after creation to add more detailed release notes if needed

## Troubleshooting

### NPM publish fails with authentication error

**If using trusted publishing (recommended):**
- Verify the trusted publisher is configured on npmjs.com
- Check that workflow filename exactly matches: `release.yml`
- Ensure organization/repository names are correct: `aarons22/homebridge-bond`
- Verify the workflow has `id-token: write` permission (already configured)
- Confirm you're using GitHub-hosted runners (not self-hosted)

**If using token authentication:**
- Verify `NPM_TOKEN` secret is set correctly
- Check if token has expired (granular tokens expire after 90 days)
- Verify the token has publish permissions for the `homebridge-bond` package
- Ensure the token is a granular access token, not a classic token

### Release workflow doesn't trigger
- Ensure the PR merged to `main` or `master` branch
- Verify `package.json` was actually modified in the commit
- Check workflow permissions in repository settings

### Version already exists on npm
- The version in package.json must be unique
- You cannot republish the same version
- Bump to a new version and try again
