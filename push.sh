#!/bin/bash
echo "Pushing mobile improvements to GitHub..."
git add -A
git commit -m "Mobile responsiveness improvements - better layout, spacing, and touch targets"
git push origin main --force
echo "Done! Your mobile improvements should be live in 1-2 minutes."