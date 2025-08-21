#!/bin/bash
set -e

echo "🔒 Removing hardcoded credentials from git history..."

# Use git filter-branch to rewrite history
git filter-branch --force --index-filter '
git rm --cached --ignore-unmatch frontend/index.html || true
' --prune-empty --tag-name-filter cat -- --all

# Remove the hardcoded values from all commits
git filter-branch --force --tree-filter '
if [ -f frontend/index.html ]; then
    sed -i.bak "s/https:\/\/dknedbhscb\.execute-api\.us-west-2\.amazonaws\.com\/prod/\${API_BASE}/g" frontend/index.html
    sed -i.bak "s/us-west-2_qwtZBlRcV/\${USER_POOL_ID}/g" frontend/index.html  
    sed -i.bak "s/5fbk7oa27t1jkcrl7o1lcmi1i3/\${CLIENT_ID}/g" frontend/index.html
    rm -f frontend/index.html.bak
fi
' --prune-empty --tag-name-filter cat -- --all

echo "✅ Git history cleaned"
echo "⚠️  Force push required: git push --force-with-lease origin main"
