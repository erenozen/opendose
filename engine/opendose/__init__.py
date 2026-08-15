"""opendose: curve-fitting and biostatistics engine.

Runs natively (CPython, for the validation test suite) and in the browser
via Pyodide. All equations and option semantics follow the official
GraphPad Prism documentation; each module cites the guide pages it
implements.
"""

from .api import analyze, analyze_json

__all__ = ["analyze", "analyze_json"]
__version__ = "0.1.0"
