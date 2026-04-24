# RPAForge Documentation Index

This directory contains the RPAForge Wiki content.

## Wiki Pages

| Page | Description |
|------|-------------|
| [Home](./Home.md) | Welcome and overview |
| [Architecture](./Architecture.md) | System architecture and components |
| [Visual Block System](./Visual-Block-System.md) | Block types, connections, and visual design |
| [Variables Management](./Variables-Management.md) | Variable scopes, types, and best practices |
| [Nested Diagrams](./Nested-Diagrams.md) | Sub-diagrams and process composition |
| [Python Integration](./Robot-Framework-Integration.md) | Python integration details |
| [Best Practices](./Best-Practices.md) | Python and RPAForge conventions |
| [MVP Roadmap](./MVP-Roadmap.md) | Development progress and timeline |

## Syncing to GitHub Wiki

To sync this documentation to GitHub Wiki:

```bash
# Clone the wiki repository
git clone https://github.com/chelslava/rpaforge.wiki.git

# Copy documentation files
cp docs/wiki/*.md rpaforge.wiki/

# Commit and push
cd rpaforge.wiki
git add .
git commit -m "Update wiki documentation"
git push
```

## Contributing

When updating documentation:
1. Update the markdown files in this directory
2. Follow the existing document structure
3. Include code examples where appropriate
4. Keep the index updated
5. Sync to GitHub Wiki after merging
