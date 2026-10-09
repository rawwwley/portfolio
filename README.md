# portfolio

A project portfolio to showcase all the projects I have going on

## Phase 0 - Correctness & Content Fixes

This phase focused on:
- Security improvements (removed hardcoded Twitch client secret)
- Filling [SWAP] placeholders with content
- Adding About/Contact sections
- Improving accessibility (skip link, focus styles)

### Security Changes
The Twitch client secret has been removed from client-side JavaScript. In a production environment, this would be handled by implementing a serverless proxy endpoint to securely manage authentication.

### Content Updates
- Added About section with bio and skills
- Added Contact section with contact information
- Filled in [SWAP] placeholders throughout the site
- Updated navigation with new sections

### Accessibility Improvements
- Added skip link for keyboard navigation
- Enhanced focus styles for interactive elements
- Improved overall keyboard operability