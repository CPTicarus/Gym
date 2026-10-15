"""
Compile the backend's own Python modules to native extension modules.

Runs inside the Docker build only (see the Dockerfile) -- never on a dev
machine, because it DELETES every .py file it compiles. What it leaves is
the same package tree with each module turned into a .so that Python
imports exactly as before, so Django still finds models, migrations,
admin modules and management commands the usual way. There is simply no
source left in the image to read back: functions become machine code, and
comments and docstrings don't survive at all.

Django, DRF and the other dependencies are not touched. They're open
source already; compiling them would protect nothing and only make the
build slower and more fragile.

Usage: python compile.py <project-root> <package> [<package> ...]
"""
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

from Cython.Build import cythonize
from Cython.Compiler import Main, Options
from setuptools import Distribution, Extension

# Django names migrations 0001_initial and so on. Python imports those from
# a file without complaint, but Cython refuses them as "not a valid module
# name" -- its check is stricter than the import system. What it generates
# for such a name is fine (PyInit_0001_initial is a valid C identifier and
# the symbol Python looks for), so the check is relaxed to allow a leading
# digit. This is also why translation below runs in this process: a worker
# process might not carry the patch.
Main.module_name_pattern = re.compile(r"\w+(\.\w+)*$")

# Package markers stay as (empty) source. A compiled __init__ is where
# Cython and the import system disagree the most, and an empty file has
# nothing in it worth hiding. One that isn't empty stops the build rather
# than shipping code as source by accident.
PACKAGE_MARKER = "__init__.py"

DIRECTIVES = {
    "language_level": 3,
    # Python semantics, not C ones: annotations stay hints. Cython would
    # otherwise treat `x: int` as a C-level type check.
    "annotation_typing": False,
    # Compiled functions behave like Python ones for introspection --
    # inspect.signature, attribute assignment by decorators (DRF's
    # @action), weak references (Django signals).
    "binding": True,
    "always_allow_keywords": True,
}


def find_sources(root, packages):
    sources = []
    for package in packages:
        for path in sorted((root / package).rglob("*.py")):
            if path.name != PACKAGE_MARKER:
                sources.append(path)
            elif path.read_text(encoding="utf-8").strip():
                sys.exit(f"{path.relative_to(root)} has code in it; move it into a module.")
    return sources


def module_name(root, path):
    return ".".join(path.relative_to(root).with_suffix("").parts)


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    root = Path(sys.argv[1]).resolve()
    packages = sys.argv[2:]
    jobs = os.cpu_count() or 1
    build_temp = Path("/tmp/gym-cython-build")

    os.chdir(root)  # build_ext --inplace resolves packages from here
    sources = find_sources(root, packages)
    if not sources:
        sys.exit("Nothing to compile.")

    # Not compiled in at all, rather than compiled in and hidden.
    Options.docstrings = False

    extensions = [
        Extension(module_name(root, path), [str(path.relative_to(root))])
        for path in sources
    ]
    ext_modules = cythonize(extensions, compiler_directives=DIRECTIVES, quiet=True)

    dist = Distribution({"name": "gym-backend", "ext_modules": ext_modules})
    build = dist.get_command_obj("build_ext")
    build.inplace = True
    build.parallel = jobs
    build.build_temp = str(build_temp)
    dist.run_command("build_ext")

    compiled = []
    for path in sources:
        matches = list(path.parent.glob(f"{path.stem}.*.so"))
        if len(matches) != 1:
            sys.exit(f"Expected one compiled module for {path}, found {matches}")
        compiled.append(matches[0])

    # The symbol table names every C function after the Python one it came
    # from; Python only needs the PyInit_* entry point to import a module.
    subprocess.run(["strip", "--strip-unneeded", *map(str, compiled)], check=True)

    for path in sources:
        path.unlink()
        path.with_suffix(".c").unlink(missing_ok=True)
    for package in packages:
        for cache in (root / package).rglob("__pycache__"):
            shutil.rmtree(cache)
    shutil.rmtree(build_temp, ignore_errors=True)
    shutil.rmtree(root / "build", ignore_errors=True)

    leftovers = [
        p for package in packages for p in (root / package).rglob("*")
        if p.suffix in {".py", ".pyc", ".c"} and p.name != PACKAGE_MARKER
    ]
    if leftovers:
        sys.exit("Left behind after compiling: " + ", ".join(map(str, leftovers)))

    print(f"Compiled {len(compiled)} modules to native code; no Python source remains.")


if __name__ == "__main__":
    main()
