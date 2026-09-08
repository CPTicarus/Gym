"""Shared helper for duplicating plans.

Workout, diet and supplement plans all support the same "copy this and
change one thing" move, and all three need the same care over the name.
"""


def copy_name(source_name, requested=None, suffix="(copy)", max_length=100):
    """A name for a duplicated plan, guaranteed to fit the column.

    Plans get duplicated from duplicates — "Push Day (copy) (copy) (copy)"
    — so the suffix grows without limit while `name` is only 100
    characters. Postgres would raise on the overflow and SQLite would
    silently truncate, which is the worst kind of difference between dev
    and production.

    When the caller supplies a name it's theirs, just clipped to fit. When
    we generate one, the BASE is trimmed rather than the suffix: "(copy)"
    is the part that says what this record is, so it's the part to keep.
    """
    if requested and requested.strip():
        return requested.strip()[:max_length]

    candidate = f"{source_name} {suffix}"
    if len(candidate) <= max_length:
        return candidate
    keep = max_length - len(suffix) - 1
    return f"{source_name[:keep].rstrip()} {suffix}"
