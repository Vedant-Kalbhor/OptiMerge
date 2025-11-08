# import pandas as pd
# import numpy as np
# from sklearn.impute import SimpleImputer

# REQUIRED_FEATURES = None


# def preprocess_weldment_file(df: pd.DataFrame, return_meta: bool = False):
#     """
#     Expect dataframe with columns: 
#         weldment_id, feature_name, value, unit, tolerance(optional), usage_count(optional)
    
#     If provided as long format (one row per feature per weldment), function will pivot.
#     If already wide (one row per weldment), it is used directly.

#     Returns:
#         - A DataFrame where each weldment is a row and numeric features are columns.
#         - Optionally, metadata (if return_meta=True).
#     """
#     # Detect long vs wide format
#     if {'weldment_id', 'feature_name', 'value'}.issubset(df.columns):
#         # Long format → pivot
#         pivot = df.pivot_table(
#             index='weldment_id',
#             columns='feature_name',
#             values='value',
#             aggfunc='first'
#         )
#         processed = pivot.reset_index()
#     else:
#         # Assume wide format already
#         processed = df.copy()

#     # Ensure weldment_id exists
#     if 'weldment_id' not in processed.columns:
#         processed.insert(0, 'weldment_id', range(len(processed)))

#     # Normalize numeric columns
#     num_cols = processed.select_dtypes(include=[np.number]).columns.tolist()

#     # Impute missing numeric values with median
#     imputer = SimpleImputer(strategy='median')
#     if len(num_cols) > 0:
#         processed[num_cols] = imputer.fit_transform(processed[num_cols])

#     # TODO: handle unit normalization if mixed units exist
#     # (Assumes all values already in consistent units)

#     if return_meta:
#         meta = {
#             'num_weldments': processed.shape[0],
#             'num_features': len(num_cols)
#         }
#         return processed, meta

#     return processed
