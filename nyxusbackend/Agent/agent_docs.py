agent_docs = {}

agent_docs['create_file_context_agent'] = """Builds contextual understanding of a file: summarizes its purpose,
lists key imports/exports/classes/functions/variables, and maps its relationships to other files.

Invoke when: the user asks what a file does, where something is defined, how a module works,
which files are involved in a feature, or asks for a repo/file summary — AND no context exists yet for that file.

Do not invoke for: debugging, writing/changing code, planning, or workflow/architecture generation."""

agent_docs["bug_finding_agent"] = """Analyzes a file (using its existing context) to locate, explain, or fix bugs
and runtime errors. Can pull the live source code for the selected file via tool access.

Invoke when: the file already has context AND the user asks to debug, fix, find issues in,
or continue prior debugging work on it.

Do not invoke for: building initial file context, planning, or unrelated file/architecture questions or explaining or building contextual understanding of the file."""

agent_docs["finish_agent"] = """Produces the final response to the user once the necessary agent work is done.

Invoke when: the requested analysis/fix is complete, or the user's message needs clarification
rather than further routing."""


agent_docs["file_analyzing_agent"] = """Selects the next file(s) to analyze based on the user's request, the code graph,
and the conversation history. Returns a single file path and reasoning for its selection."""

