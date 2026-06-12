"""catalog_sweep — polite, free-first sweep of glass-art supplier color catalogs.

The pipeline turns supplier product feeds into a standalone, versioned catalog under
``src/data/catalog/*.json`` whose entries link back to the explainer's science by the
colorant ids already defined in ``src/data/optics.json``.

Stages (see ``run.py``):  fetch -> extract -> swatch -> normalize -> emit.
The network stage (fetch) is strictly separated from the transform stages via the
``raw/`` cache, so re-running transforms never re-hits a supplier site.
"""

__all__ = ["__version__"]
__version__ = "0.1.0"
