"""Group the API reference sidebar: section headers with collapsible groups inside.

The API publishes an OpenAPI 3.1 spec with one flat tag per router. Mintlify
nests groups from OpenAPI 3.2 tags (`parent`), so this script marks the spec as
3.2 and gives each tag its parent from TREE. Run it every time
api-reference/openapi.json is replaced:

    python3 scripts/nest_api_tags.py api-reference/openapi.json

A tag missing from TREE stays a top-level group, so nothing disappears; add it
to TREE to place it. A tag whose parent group has no endpoints in the spec goes
straight under the section. Running it twice gives the same result.
"""

import json
import sys

# Section header -> group -> subgroups. Names are the API's tags.
TREE = {
    "Conversations": {
        "Conversations": ["Calls (deprecated)", "Calls", "Recordings", "Logs", "Traces"],
    },
    "Agents": {
        "Agents": ["Agent Templates", "Voices", "Conversational Paths"],
        "Knowledge": ["Knowledge Bases", "Knowledge Items"],
        "Integration": ["Integration Templates"],
    },
    "Channels": {
        "Phones": [],
        "Mailboxes": [],
    },
    "Workflows": {
        "Workflows": [
            "Workflows - Pieces",
            "Workflows - Templates",
            "Workflows - Actions",
            "Workflows - Branches",
            "Workflows - Testing",
            "Workflows - Executions",
            "Workflows - Client Connections",
            "Public Client Connections",
        ],
    },
    "Account": {
        "Projects": ["Project Members", "Project Invitations", "Roles"],
        "API Keys": [],
        "Security": [],
        "Webhooks": [],
        "Notifications": [],
        "Billing": [
            "Billing - Customers",
            "Billing - Payment Methods",
            "Billing - Subscriptions",
            "Verification",
        ],
    },
}


def used_tags(spec: dict) -> list:
    """The first tag of every operation, in the order they appear."""
    seen: list = []
    for item in spec.get("paths", {}).values():
        for operation in item.values():
            if isinstance(operation, dict) and operation.get("tags"):
                tag = operation["tags"][0]
                if tag not in seen:
                    seen.append(tag)
    return seen


def nest(spec: dict) -> dict:
    used = used_tags(spec)
    section_of: dict = {}
    group_of: dict = {}
    for section, groups in TREE.items():
        for group, subgroups in groups.items():
            section_of[group] = section
            for subgroup in subgroups:
                section_of[subgroup] = section
                group_of[subgroup] = group

    def section_id(section: str) -> str:
        return f"section-{section.lower()}"

    def parent(tag: str) -> str:
        group = group_of.get(tag)
        # A subgroup whose group has no endpoints of its own here hangs from the section.
        if group and (group in used or any(group_of.get(t) == group for t in used)):
            return group
        return section_id(section_of[tag])

    needed = set(used)
    for tag in used:
        group = group_of.get(tag)
        if group and parent(tag) == group:
            needed.add(group)

    tags = []
    for section in TREE:
        if any(section_of.get(tag) == section for tag in needed):
            tags.append({"name": section_id(section), "summary": section})
    for tag in [t for t in section_of if t in needed] + [t for t in used if t not in section_of]:
        entry = {"name": tag}
        if tag in section_of:
            entry["parent"] = parent(tag)
        tags.append(entry)

    spec["openapi"] = "3.2.0"
    spec["tags"] = tags
    return spec


def main(path: str) -> None:
    with open(path) as f:
        spec = json.load(f)
    nest(spec)
    with open(path, "w") as f:
        json.dump(spec, f, indent=2, ensure_ascii=False)
        f.write("\n")
    loose = [t for t in used_tags(spec) if t not in {e["name"] for e in spec["tags"] if "parent" in e}]
    if loose:
        print("Not in TREE, left at the top level:", ", ".join(loose))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "api-reference/openapi.json")
