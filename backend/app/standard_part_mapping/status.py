"""Human-readable implementation status for the mapping pipeline."""

PIPELINE_STATUS = [
    {"step": "Standard library ingestion", "status": "implemented"},
    {"step": "Legacy BOM parsing", "status": "implemented"},
    {"step": "Text normalization and regex extraction", "status": "implemented"},
    {"step": "Rule-based candidate matching", "status": "implemented"},
    {"step": "Manual candidate selection UI", "status": "pending"},
    {"step": "Export mapped workbook", "status": "pending"},
    {"step": "Non-fastener family expansion", "status": "pending"},
    {"step": "Learned alias feedback loop", "status": "partial"},
]

