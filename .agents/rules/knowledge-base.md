# Knowledge Base Access Rule

Central Knowledge Base for all projects is located at:
`D:\Repo\RepoBase\knowledge-base`

## Mandatory Workflow for Every Session

1. **Consult Knowledge Base Before Coding**:
   - Check project index: `D:\Repo\RepoBase\knowledge-base\projects\rpaforge\project-index.md`
   - Run semantic search when needed:
     ```powershell
     cd D:\Repo\RepoBase\knowledge-base
     pwsh semantic/kb-search.ps1 "query/topic"
     ```
2. **Write Discoveries to Central KB**:
   - Record findings and updates to `D:\Repo\RepoBase\knowledge-base\projects\rpaforge\wiki/`
3. **Repository Rules & Architecture**:
   - Always refer to central KB for architectural decisions, ADRs, and known issue resolutions.
