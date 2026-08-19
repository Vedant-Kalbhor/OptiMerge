# PROJECT CONTEXT

Project: `OptiMerge`

---

# PROJECT STRUCTURE

```text
OptiMerge/
├── backend/
│   ├── app/
│   │   ├── archive_temp/
│   │   │   ├── bom_analysis.py
│   │   │   ├── clustering.py
│   │   │   ├── models.py
│   │   │   ├── schemas.py
│   │   │   └── utils.py
│   │   ├── uploads/
│   │   │   ├── cost-weldment-copy.xlsx
│   │   │   └── Sample weldment dimension file - Copy.xlsx
│   │   ├── api.py
│   │   ├── bom_savings_utils.py
│   │   ├── bom_utils.py
│   │   ├── clustering_utils.py
│   │   ├── db.py
│   │   ├── dimension_extractor.py
│   │   ├── main.py
│   │   ├── ml_pipeline.py
│   │   ├── pipe_utils.py
│   │   ├── preprocess.py
│   │   └── replacement_utils.py
│   ├── uploads/
│   │   ├── BOM-new.xlsx
│   │   ├── Comparison_Report_XYZ_Bends.xlsx
│   │   ├── Comparison_Report_XYZOnly.xlsx
│   │   ├── DRAWINGS ON BASIC FEATURES.pdf
│   │   ├── new_weldment.xlsx
│   │   ├── Sample Drg.pdf
│   │   ├── Sample weldment dimension file.xlsx
│   │   └── updated-bom-188257a6-2811-42c4-ab05-89e97f5a7bb0-2025-12-10.xlsx
│   ├── .env
│   ├── .env.test
│   ├── mysql_output.txt
│   ├── mysql_output_utf8.txt
│   ├── optimerge_sql_queries.sql
│   ├── poetry.lock
│   ├── pyproject.toml
│   ├── requirements.txt
│   └── test_db.py
├── frontend/
│   ├── public/
│   │   └── vite.svg
│   ├── src/
│   │   ├── assets/
│   │   │   ├── optimization_icon.svg
│   │   │   └── react.svg
│   │   ├── components/
│   │   │   ├── ClusterChart.jsx
│   │   │   ├── DimTable.jsx
│   │   │   ├── DrawingExtractorModal.jsx
│   │   │   ├── PageVisual.jsx
│   │   │   └── Sidebar.jsx
│   │   ├── context/
│   │   │   └── AuthContext.jsx
│   │   ├── pages/
│   │   │   ├── AnalysisPage.jsx
│   │   │   ├── BOMComparePage.jsx
│   │   │   ├── BOMReplacementSuggestion.jsx
│   │   │   ├── BOMResultsPage.jsx
│   │   │   ├── BOMSavingsCalculator.jsx
│   │   │   ├── ClusteringResultsPage.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── DimensionExtractionPage.jsx
│   │   │   ├── LoginPage.jsx
│   │   │   ├── PipesResultsPage.jsx
│   │   │   ├── PreviousAnalysisPage.jsx
│   │   │   ├── ResultsPage.jsx
│   │   │   ├── SignupPage.jsx
│   │   │   ├── UploadPage.jsx
│   │   │   └── WeldmentResultsPage.jsx
│   │   ├── services/
│   │   │   ├── api.js
│   │   │   └── auth.js
│   │   ├── utils/
│   │   │   ├── dimensionExtraction.js
│   │   │   └── helpers.js
│   │   ├── App.css
│   │   ├── App.jsx
│   │   ├── index.css
│   │   └── main.jsx
│   ├── .gitignore
│   ├── eslint.config.js
│   ├── index.html
│   ├── package-lock.json
│   ├── package.json
│   └── vite.config.js
├── .gitignore
├── README.md
└── structure.txt
```

---

# CODE STRUCTURE

Python files analyzed: **17**
JavaScript files analyzed: **29**

FILE: `backend/app/api.py`
IMPORTS:
  fastapi import APIRouter, UploadFile, File, Form, HTTPException
  fastapi.responses import JSONResponse
  pandas
  io import BytesIO
  preprocess import preprocess_weldment_file
  ml_pipeline import run_clustering
ASYNC FUNCTION upload_weldments(file=...) [line 12]
ASYNC FUNCTION analyze_clustering(file=..., algorithm=...) [line 30]

FILE: `backend/app/archive_temp/bom_analysis.py`
No classes or functions detected.

FILE: `backend/app/archive_temp/clustering.py`
No classes or functions detected.

FILE: `backend/app/archive_temp/models.py`
No classes or functions detected.

FILE: `backend/app/archive_temp/schemas.py`
No classes or functions detected.

FILE: `backend/app/archive_temp/utils.py`
No classes or functions detected.

FILE: `backend/app/bom_savings_utils.py`
IMPORTS:
  pandas
  numpy
  typing import Dict, List, Tuple, Optional
  json
FUNCTION parse_bom_file(file_path, file_type=...) [line 6]
FUNCTION calculate_bom_savings(bom_df, replacements) [line 86]

FILE: `backend/app/bom_utils.py`
IMPORTS:
  pandas
  numpy
  re
  typing import Dict, Any, List, Tuple
  math
  re
  collections import defaultdict
FUNCTION clean_column_name(column_name) [line 9]
FUNCTION preprocess_bom_file(bom_df) [line 17]
FUNCTION validate_bom_data(df) [line 110]
FUNCTION _to_float_safe(v) [line 119]
FUNCTION compute_bom_similarity(assembly_components, threshold=...) [line 133]
FUNCTION _compute_quantity_aware_lists(comp_map_a, comp_map_b) [line 279]
FUNCTION compute_bom_similarity(assembly_components, threshold=...) [line 305]
FUNCTION _compute_replacement_rows_for_pair(bom_a, bom_b, comp_map_a, comp_map_b, unit_price_map, original_jaccard_pct) [line 399]
FUNCTION generate_component_replacement_table(assembly_components, similar_pairs, unit_price_map, max_pairs=...) [line 489]
FUNCTION generate_replacement_suggestions(similar_pairs, assembly_costs, currency_map=..., limit=...) [line 509]
FUNCTION find_assembly_clusters(assemblies, similarity_matrix, threshold=...) [line 550]
FUNCTION calculate_reduction_potential(clusters, total_assemblies) [line 566]
FUNCTION analyze_bom_data(bom_df, threshold=...) [line 573]

FILE: `backend/app/clustering_utils.py`
IMPORTS:
  pandas
  numpy
  sklearn.cluster import KMeans, DBSCAN
  sklearn.preprocessing import StandardScaler
  sklearn.metrics import silhouette_score
  scipy.cluster.hierarchy import linkage, fcluster
  sklearn.decomposition import PCA
  typing import List, Tuple, Optional, Dict, Any
  math
  string
  re
FUNCTION clean_column_name(column_name) [line 13]
FUNCTION parse_weldment_excel(file_path) [line 22]
FUNCTION validate_weldment_columns(df) [line 33]
FUNCTION validate_weldment_data(df) [line 67]
FUNCTION perform_dimensional_clustering(df, clustering_method=..., n_clusters=..., tolerance=...) [line 93]
FUNCTION _col_index_to_excel_letter(idx) [line 187]
FUNCTION _get_column_letter_map(df) [line 200]
FUNCTION _values_match(v1, v2, tol=...) [line 209]
FUNCTION compare_two_variants(row_a, row_b, columns, col_letter_map, tolerance=...) [line 234]
FUNCTION pairwise_variant_comparison(df, key_col=..., columns_to_compare=..., tolerance=..., threshold=..., include_self=...) [line 283]

FILE: `backend/app/db.py`
IMPORTS:
  sqlalchemy import create_engine, Column, String, Text, DateTime, Boolean, UniqueConstraint, text
  sqlalchemy.orm import declarative_base, sessionmaker
  sqlalchemy.exc import SQLAlchemyError
  dotenv import load_dotenv
  datetime import datetime
  os
  json
  uuid
CLASS AnalysisResult(Base) [line 37]
CLASS User(Base) [line 48]
CLASS _Cursor [line 70]
  METHOD __init__(self, docs) [line 76]
  METHOD sort(self, key, direction=...) [line 79]
  METHOD __iter__(self) [line 88]
  METHOD __len__(self) [line 91]
CLASS _AnalysisCollection [line 96]
  METHOD _serialize_raw(raw_val) [line 106]
  METHOD _deserialize_raw(raw_str) [line 116]
  METHOD _to_dict(obj) [line 126]
  METHOD replace_one(self, filter_, document, upsert=...) [line 137]
  METHOD find_one(self, filter_) [line 169]
  METHOD find(self, filter_=...) [line 182]
  METHOD delete_one(self, filter_) [line 210]
CLASS _UsersCollection [line 224]
  METHOD _to_dict(obj) [line 234]
  METHOD find_one(self, filter_) [line 245]
  METHOD insert_one(self, document) [line 256]
  METHOD create_index(self, field, unique=...) [line 283]
FUNCTION ensure_indexes() [line 297]

FILE: `backend/app/dimension_extractor.py`
IMPORTS:
  re
  math
  typing import Dict, List, Any, Optional
  re
FUNCTION _parse_block(text, cx, cy) [line 52]
FUNCTION _euclidean(a, b) [line 148]
FUNCTION split_span_bbox(text, bbox) [line 151]
FUNCTION _merge_nearby_labels(labels, cx_tol=..., cy_tol=...) [line 167]
FUNCTION _split_span_tokens(text, bbox) [line 185]
FUNCTION _extract_page(page) [line 208]
FUNCTION _process_doc(doc, filename) [line 281]
FUNCTION extract_dimensions_from_pdf(pdf_path) [line 314]
FUNCTION extract_dimensions_from_bytes(file_bytes, filename=...) [line 322]
FUNCTION _post_process_entries(entries) [line 330]
FUNCTION extract_with_bboxes(file_bytes, filename=...) [line 388]

FILE: `backend/app/main.py`
IMPORTS:
  fastapi import FastAPI, UploadFile, File, HTTPException, Depends, status, Form
  fastapi.middleware.cors import CORSMiddleware
  fastapi.staticfiles import StaticFiles
  fastapi.security import OAuth2PasswordBearer
  pandas
  os
  uuid
  datetime import datetime, timedelta
  typing import Optional
  fastapi.responses import JSONResponse, Response
  pydantic import BaseModel, EmailStr
  jose import JWTError, jwt
  passlib.context import CryptContext
  logging
  json
  typing import List, Dict, Any
  dimension_extractor import extract_dimensions_from_bytes, extract_with_bboxes
  db import analysis_collection, users_collection, ensure_indexes
  bson import ObjectId
  clustering_utils import parse_weldment_excel, validate_weldment_data, perform_dimensional_clustering
  bom_utils import validate_bom_data, analyze_bom_data
  pipe_utils import parse_pipe_excel, pairwise_pipe_comparison, generate_pipe_excel_report
  logging
FUNCTION _utf8_byte_len(s) [line 74]
CLASS UserBase(BaseModel) [line 79]
CLASS UserCreate(UserBase) [line 84]
CLASS UserLogin(BaseModel) [line 88]
CLASS UserOut(UserBase) [line 93]
CLASS Token(BaseModel) [line 98]
CLASS TokenData(BaseModel) [line 103]
FUNCTION get_password_hash(password) [line 108]
FUNCTION verify_password(plain_password, hashed_password) [line 130]
FUNCTION create_access_token(data, expires_delta=...) [line 146]
FUNCTION get_user_by_email(email) [line 154]
FUNCTION authenticate_user(email, password) [line 158]
ASYNC FUNCTION get_current_user(token=...) [line 167]
ASYNC FUNCTION signup(user_in) [line 193]
ASYNC FUNCTION login(user_in) [line 221]
ASYNC FUNCTION read_current_user(current_user=...) [line 234]
FUNCTION generate_file_id() [line 258]
ASYNC FUNCTION upload_weldments(file=...) [line 267]
ASYNC FUNCTION upload_boms(file=...) [line 325]
ASYNC FUNCTION get_weldment_files() [line 397]
ASYNC FUNCTION get_bom_files() [line 411]
ASYNC FUNCTION get_weldment_data(file_id) [line 425]
ASYNC FUNCTION upload_pipes(file=...) [line 441]
ASYNC FUNCTION get_pipe_files() [line 485]
ASYNC FUNCTION get_pipe_data(file_id) [line 499]
ASYNC FUNCTION analyze_dimensional_clustering(request) [line 515]
ASYNC FUNCTION analyze_bom_similarity(request) [line 563]
ASYNC FUNCTION calculate_bom_savings(file=..., analysis_id=..., replacements=...) [line 630]
ASYNC FUNCTION get_analysis(analysis_id) [line 824]
ASYNC FUNCTION recent_analyses() [line 854]
FUNCTION save_analysis_to_mongodb(analysis_id, analysis_type, result) [line 860]
ASYNC FUNCTION delete_analysis(analysis_id) [line 883]
ASYNC FUNCTION analyze_weldment_pairwise(request) [line 898]
ASYNC FUNCTION analyze_pipe_pairwise(request) [line 1210]
ASYNC FUNCTION export_pipe_analysis(analysis_id, mode=..., format=...) [line 1269]
ASYNC FUNCTION root() [line 1318]
ASYNC FUNCTION health_check() [line 1323]
FUNCTION on_startup() [line 1327]
ASYNC FUNCTION extract_dimensions(file=...) [line 1333]
ASYNC FUNCTION extract_dimensions_bbox(file=...) [line 1344]

FILE: `backend/app/ml_pipeline.py`
IMPORTS:
  numpy
  pandas
  sklearn.preprocessing import StandardScaler
  sklearn.cluster import KMeans, AgglomerativeClustering
  hdbscan
  umap
FUNCTION _scale_features(X) [line 9]
FUNCTION run_clustering(df, algorithm=...) [line 16]

FILE: `backend/app/pipe_utils.py`
IMPORTS:
  pandas
  numpy
  io
  re
  typing import List, Dict, Any, Optional
FUNCTION clean_column_name(column_name) [line 7]
FUNCTION parse_pipe_val(val) [line 15]
FUNCTION parse_pipe_excel(file_path_or_bytes, file_name=...) [line 27]
FUNCTION calc_similarity(v1, v2) [line 107]
FUNCTION pairwise_pipe_comparison(df, mode=..., threshold=...) [line 137]
FUNCTION generate_pipe_excel_report(records, mode=...) [line 242]

FILE: `backend/app/preprocess.py`
IMPORTS:
  pandas
  numpy
  sklearn.impute import SimpleImputer
FUNCTION preprocess_weldment_file(df, return_meta=...) [line 8]

FILE: `backend/app/replacement_utils.py`
IMPORTS:
  pandas
  numpy
  typing import Dict, List, Tuple, Optional
FUNCTION detect_column(columns, candidates) [line 12]
FUNCTION build_component_lookup_from_weldment(df) [line 19]
FUNCTION build_component_replacement_map(weld_df, pairwise_records, assy_col=..., comp_col=..., cost_col=...) [line 27]
FUNCTION apply_replacements_to_bomworkbook(bom_workbook, replacement_map, qty_col_hint=..., eau_value=..., cost_lookup=...) [line 106]

FILE: `backend/test_db.py`
IMPORTS:
  os
  sqlalchemy import create_engine
  dotenv import load_dotenv
  pymysql

FILE: `frontend/eslint.config.js`
IMPORTS:
  js from '@eslint/js' [line 1]
  globals from 'globals' [line 2]
  reactHooks from 'eslint-plugin-react-hooks' [line 3]
  reactRefresh from 'eslint-plugin-react-refresh' [line 4]
  { defineConfig, globalIgnores } from 'eslint/config' [line 5]
EXPORTS:
  defineConfig([ [line 7]

FILE: `frontend/src/App.jsx`
IMPORTS:
  React, { useState } from 'react' [line 1]
  { [line 2]
  { Layout, ConfigProvider, App as AntdApp, Button } from 'antd' [line 8]
  Sidebar from './components/Sidebar' [line 10]
  Dashboard from './pages/Dashboard' [line 11]
  UploadPage from './pages/UploadPage' [line 12]
  AnalysisPage from './pages/AnalysisPage' [line 13]
  ClusteringResultsPage from './pages/ClusteringResultsPage' [line 14]
  BOMResultsPage from './pages/BOMResultsPage' [line 15]
  PreviousAnalysisPage from './pages/PreviousAnalysisPage' [line 16]
  WeldmentResultsPage from './pages/WeldmentResultsPage' [line 17]
  PipesResultsPage from './pages/PipesResultsPage' [line 18]
  BOMComparePage from './pages/BOMComparePage' [line 19]
  BOMReplacementSuggestion from './pages/BOMReplacementSuggestion' [line 20]
  LoginPage from './pages/LoginPage' [line 21]
  SignupPage from './pages/SignupPage' [line 22]
  BOMSavingsCalculator from './pages/BOMSavingsCalculator' [line 23]
  { AuthProvider, useAuth } from './context/AuthContext' [line 24]
  DimensionExtractionPage from './pages/DimensionExtractionPage' [line 25]
  './App.css' [line 27]
EXPORTS:
  App [line 133]
FUNCTION PrivateRoute() [line 32]
FUNCTION App() [line 42]
FUNCTION toggleCollapse() [line 44]

FILE: `frontend/src/components/ClusterChart.jsx`
IMPORTS:
  React from "react" [line 123]
  { [line 124]
EXPORTS:
  function ClusterChart({ data }) { [line 135]
FUNCTION ClusterChart() [line 135]

FILE: `frontend/src/components/DimTable.jsx`
IMPORTS:
  React from 'react' [line 1]
  { Table, Input, Button, message } from 'antd' [line 2]
  { DeleteOutlined, PlusOutlined, CopyOutlined } from '@ant-design/icons' [line 3]
EXPORTS:
  function DimTable({ rows = [], onChange }) { [line 5]
FUNCTION DimTable() [line 5]
FUNCTION handleChange() [line 8]
FUNCTION handleRemove() [line 15]
FUNCTION handleAdd() [line 19]
FUNCTION handleCopy() [line 30]

FILE: `frontend/src/components/DrawingExtractorModal.jsx`
IMPORTS:
  React, { useState, useCallback, useRef } from 'react' [line 1]
  PageVisual from "./PageVisual" [line 2]
  { Modal, Button, Alert, Divider, message } from 'antd' [line 3]
  { extractDimensions, extractDimensionsBbox } from '../services/api' [line 4]
  DimTable from './DimTable' [line 5]
EXPORTS:
  function DrawingExtractorModal({ open, onClose, onConfirm }) { [line 83]
FUNCTION buildRowsFromBbox() [line 7]
FUNCTION distance() [line 18]
FUNCTION DrawingExtractorModal() [line 83]
FUNCTION handleLabelChange() [line 96]
FUNCTION handleConfirm() [line 194]

FILE: `frontend/src/components/PageVisual.jsx`
IMPORTS:
  React, { useRef, useState, memo, useEffect } from "react" [line 1]
  { Modal, Input } from "antd" [line 2]
EXPORTS:
  memo(function PageVisual({ pageData, labelsRef, onLabelChange, onAddBlock, onUpdateBlocks, onSelect }) { [line 10]
FUNCTION handleImgLoad() [line 23]
FUNCTION getLabel() [line 29]
FUNCTION getCoords() [line 34]
FUNCTION startEdit() [line 41]
FUNCTION confirmEdit() [line 48]
FUNCTION handleMouseDown() [line 56]
FUNCTION handleMouseMove() [line 64]
FUNCTION handleMouseUp() [line 87]
FUNCTION handleResizeStart() [line 123]
FUNCTION handler() [line 129]

FILE: `frontend/src/components/Sidebar.jsx`
IMPORTS:
  React from 'react' [line 1]
  { Menu, Button } from 'antd' [line 2]
  { [line 3]
  { useNavigate, useLocation } from 'react-router-dom' [line 11]
EXPORTS:
  Sidebar [line 47]
FUNCTION Sidebar() [line 13]

FILE: `frontend/src/context/AuthContext.jsx`
IMPORTS:
  React, { createContext, useContext, useEffect, useState } from "react" [line 1]
  { getCurrentUser, login as apiLogin, signup as apiSignup } from "../services/auth" [line 2]
  { message } from "antd" [line 3]
EXPORTS:
  function AuthProvider({ children }) { [line 7]
  function useAuth() { [line 79]
FUNCTION AuthProvider() [line 7]
FUNCTION handleLogin() [line 28]
FUNCTION handleSignup() [line 45]
FUNCTION logout() [line 57]
FUNCTION useAuth() [line 79]

FILE: `frontend/src/main.jsx`
IMPORTS:
  React from 'react' [line 1]
  ReactDOM from 'react-dom/client' [line 2]
  App from './App.jsx' [line 3]
  './index.css' [line 4]

FILE: `frontend/src/pages/AnalysisPage.jsx`
IMPORTS:
  React, { useEffect, useRef, useState } from 'react' [line 2]
  { [line 3]
  { PlayCircleOutlined } from '@ant-design/icons' [line 6]
  { [line 7]
  { useNavigate, useLocation } from 'react-router-dom' [line 11]
EXPORTS:
  AnalysisPage [line 530]
FUNCTION AnalysisPage() [line 15]
FUNCTION runSmartAnalysis() [line 44]
FUNCTION loadFiles() [line 89]
FUNCTION onDimensionalAnalysis() [line 106]
FUNCTION onBOMAnalysis() [line 135]
FUNCTION onWeldmentComparison() [line 164]
FUNCTION onPipeComparison() [line 202]

FILE: `frontend/src/pages/BOMComparePage.jsx`
IMPORTS:
  React, { useMemo } from "react" [line 1]
  { useParams, useLocation, useNavigate } from "react-router-dom" [line 2]
  { Card, Row, Col, Tag, Button, Typography, Divider } from "antd" [line 3]
EXPORTS:
  function BOMComparePage() { [line 197]
FUNCTION parseList() [line 12]
FUNCTION parseComponentQtyString() [line 48]
FUNCTION getComponentName() [line 72]
FUNCTION listToNameString() [line 85]
FUNCTION csvEscape() [line 92]
FUNCTION CommonComponentTag() [line 100]
FUNCTION UniqueComponentTag() [line 155]
FUNCTION BOMComparePage() [line 197]
FUNCTION handleExportCsv() [line 298]

FILE: `frontend/src/pages/BOMReplacementSuggestion.jsx`
IMPORTS:
  React, { useEffect, useState } from 'react' [line 7]
  { Card, Table, Button, Alert, Spin, message, Collapse, Typography } from 'antd' [line 8]
  { DownloadOutlined } from '@ant-design/icons' [line 9]
  { useLocation, useNavigate, useParams } from 'react-router-dom' [line 10]
  { getAnalysisResults } from '../services/api' [line 11]
  { saveAs } from 'file-saver' [line 12]
EXPORTS:
  BOMReplacementSuggestion [line 541]
FUNCTION BOMReplacementSuggestion() [line 17]
FUNCTION loadAnalysis() [line 48]
FUNCTION round2() [line 63]
FUNCTION round4() [line 64]
FUNCTION currencySymbol() [line 70]
FUNCTION fmtMoney() [line 85]
FUNCTION getAssemblyCostLabel() [line 95]
FUNCTION buildGroups() [line 106]
FUNCTION handleExportCSV() [line 255]

FILE: `frontend/src/pages/BOMResultsPage.jsx`
IMPORTS:
  React, { useState, useEffect, useMemo } from 'react' [line 1]
  { Card, Table, Tag, Progress, Alert, Button, Spin, message } from 'antd' [line 2]
  { DownloadOutlined, BarChartOutlined } from '@ant-design/icons' [line 3]
  { saveAs } from 'file-saver' [line 4]
  { getAnalysisResults } from '../services/api' [line 5]
  { useParams, useNavigate, useLocation } from 'react-router-dom' [line 6]
  { [line 9]
  { Bar } from 'react-chartjs-2' [line 18]
EXPORTS:
  BOMResultsPage [line 387]
FUNCTION BOMResultsPage() [line 22]
FUNCTION loadAnalysisResults() [line 41]
FUNCTION handleExportSimilarPairs() [line 56]

FILE: `frontend/src/pages/BOMSavingsCalculator.jsx`
IMPORTS:
  React, { useState, useEffect } from 'react' [line 1]
  { [line 2]
  { [line 20]
  { useParams, useNavigate } from 'react-router-dom' [line 27]
  { calculateBOMSavings, getAnalysisResults } from '../services/api' [line 28]
  { saveAs } from 'file-saver' [line 29]
  * as XLSX from 'xlsx' [line 30]
EXPORTS:
  BOMSavingsCalculator [line 832]
FUNCTION BOMSavingsCalculator() [line 35]
FUNCTION fetchAnalysisData() [line 58]
FUNCTION parseFile() [line 114]
FUNCTION handleFileUpload() [line 174]
FUNCTION handleCalculateSavings() [line 202]
FUNCTION handleExportResults() [line 240]
FUNCTION handleDownloadUpdatedFile() [line 293]
FUNCTION handleTableChange() [line 428]

FILE: `frontend/src/pages/ClusteringResultsPage.jsx`
IMPORTS:
  React, { useState, useEffect } from 'react' [line 1]
  { Card, Table, Tag, Progress, Row, Col, Alert, Button, Spin, Modal, message } from 'antd' [line 2]
  { DownloadOutlined, EyeOutlined, ClusterOutlined } from '@ant-design/icons' [line 3]
  { saveAs } from 'file-saver' [line 4]
  ClusterChart from '../components/ClusterChart' [line 5]
  { getAnalysisResults } from '../services/api' [line 6]
  { useParams, useNavigate, useLocation } from 'react-router-dom' [line 7]
EXPORTS:
  ClusteringResultsPage [line 294]
FUNCTION ClusteringResultsPage() [line 9]
FUNCTION loadAnalysisResults() [line 30]
FUNCTION handleExportClusters() [line 46]
FUNCTION handleViewCluster() [line 73]
FUNCTION calculateStatistics() [line 122]
FUNCTION getVisualizationData() [line 144]

FILE: `frontend/src/pages/Dashboard.jsx`
IMPORTS:
  React, { useState, useEffect } from 'react' [line 1]
  { Card, Row, Col, Statistic, Table, Progress, Alert, Button, Spin, Space, Popconfirm, message } from 'antd' [line 2]
  { UploadOutlined, ClusterOutlined, BarChartOutlined, RocketOutlined, LogoutOutlined, UserOutlined, DeleteOutlined } from '@ant-design/icons' [line 3]
  { useNavigate } from 'react-router-dom' [line 4]
  { getWeldmentFiles, getBOMFiles, getRecentAnalyses,deleteAnalysis } from '../services/api' [line 5]
  { useAuth } from '../context/AuthContext' [line 6]
EXPORTS:
  Dashboard [line 344]
FUNCTION Dashboard() [line 8]
FUNCTION loadDashboardData() [line 26]
FUNCTION handleDelete() [line 57]
FUNCTION loadRecentAnalyses() [line 71]
FUNCTION handleQuickAction() [line 95]

FILE: `frontend/src/pages/DimensionExtractionPage.jsx`
IMPORTS:
  React, { useState } from 'react' [line 1]
  { Card, Button, Alert, Typography, Divider, Space, Tag, message } from 'antd' [line 2]
  { FilePdfOutlined, ThunderboltOutlined, EyeOutlined, DownloadOutlined } from '@ant-design/icons' [line 3]
  DrawingExtractorModal from '../components/DrawingExtractorModal' [line 4]
EXPORTS:
  DimensionExtractionPage [line 172]
FUNCTION DimensionExtractionPage() [line 8]
FUNCTION handleConfirm() [line 12]
FUNCTION handleDownloadCSV() [line 17]
FUNCTION handleDownloadTSV() [line 28]

FILE: `frontend/src/pages/LoginPage.jsx`
IMPORTS:
  React from "react" [line 1]
  { Button, Card, Form, Input, Typography } from "antd" [line 2]
  { useNavigate, Link } from "react-router-dom" [line 3]
  { useAuth } from "../context/AuthContext" [line 4]
EXPORTS:
  LoginPage [line 70]
FUNCTION LoginPage() [line 8]
FUNCTION onFinish() [line 13]

FILE: `frontend/src/pages/PipesResultsPage.jsx`
IMPORTS:
  React, { useState, useEffect } from 'react' [line 1]
  { [line 2]
  { DownloadOutlined, FileExcelOutlined, FileTextOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons' [line 19]
  { saveAs } from 'file-saver' [line 20]
  { getAnalysisResults, exportPipeReport } from '../services/api' [line 21]
  { useParams, useLocation, useNavigate } from 'react-router-dom' [line 22]
EXPORTS:
  PipesResultsPage [line 316]
FUNCTION PipesResultsPage() [line 24]
FUNCTION loadAnalysisResults() [line 44]
FUNCTION handleExport() [line 60]
FUNCTION handleFallbackCSV() [line 81]

FILE: `frontend/src/pages/PreviousAnalysisPage.jsx`
IMPORTS:
  React, { useEffect, useState, useMemo } from 'react' [line 1]
  { [line 2]
  { [line 18]
  { saveAs } from 'file-saver' [line 25]
  ClusterChart from '../components/ClusterChart' [line 26]
  { getAnalysisResults } from '../services/api' [line 27]
  { useParams, useNavigate } from 'react-router-dom' [line 28]
  { useLocation } from 'react-router-dom' [line 29]
  { Bar } from 'react-chartjs-2' [line 30]
  { [line 31]
EXPORTS:
  PreviousAnalysisPage [line 1290]
FUNCTION PreviousAnalysisPage() [line 52]
FUNCTION loadPastAnalysis() [line 69]
FUNCTION normalizeClusters() [line 87]
FUNCTION calculateStatistics() [line 113]
FUNCTION prepareVisualizationConfig() [line 127]
FUNCTION handleExportWeldmentCSV() [line 140]
FUNCTION handleNavigateToBOMSavings() [line 260]
FUNCTION handleExportSimilarPairs() [line 265]

FILE: `frontend/src/pages/ResultsPage.jsx`
IMPORTS:
  React, { useState, useEffect } from 'react' [line 1]
  { Card, Table, Tag, Progress, Row, Col, Alert, Button, Spin, Modal, message } from 'antd' [line 2]
  { DownloadOutlined, EyeOutlined, ClusterOutlined, BarChartOutlined } from '@ant-design/icons' [line 3]
  { saveAs } from 'file-saver' [line 4]
  ClusterChart from '../components/ClusterChart' [line 5]
  { getAnalysisResults } from '../services/api' [line 6]
  { useParams, useNavigate, useLocation } from 'react-router-dom' [line 7]
EXPORTS:
  ResultsPage [line 554]
FUNCTION ResultsPage() [line 9]
FUNCTION loadAnalysisResults() [line 31]
FUNCTION handleExportReport() [line 46]
FUNCTION handleExportClusters() [line 64]
FUNCTION handleViewCluster() [line 91]
FUNCTION calculateStatistics() [line 289]
FUNCTION getVisualizationData() [line 315]
FUNCTION Statistic() [line 544]

FILE: `frontend/src/pages/SignupPage.jsx`
IMPORTS:
  React from "react" [line 1]
  { Button, Card, Form, Input, Typography } from "antd" [line 2]
  { useNavigate, Link } from "react-router-dom" [line 3]
  { useAuth } from "../context/AuthContext" [line 4]
EXPORTS:
  SignupPage [line 81]
FUNCTION SignupPage() [line 8]
FUNCTION onFinish() [line 13]

FILE: `frontend/src/pages/UploadPage.jsx`
IMPORTS:
  React, { useEffect, useState } from 'react' [line 1]
  { Upload, Button, Card, Row, Col, message, Alert, Divider } from 'antd' [line 2]
  { FilePdfOutlined, InboxOutlined } from '@ant-design/icons' [line 3]
  { useNavigate } from 'react-router-dom' [line 4]
  * as XLSX from 'xlsx' [line 5]
  { [line 6]
  DrawingExtractorModal from '../components/DrawingExtractorModal' [line 12]
EXPORTS:
  UploadPage [line 304]
FUNCTION normalizeHeader() [line 16]
FUNCTION containsAny() [line 22]
FUNCTION containsAll() [line 27]
FUNCTION readHeadersFromFile() [line 32]
FUNCTION detectUploadTarget() [line 58]
FUNCTION UploadPage() [line 121]
FUNCTION checkServerHealth() [line 128]
FUNCTION handleSmartUpload() [line 138]
FUNCTION handleExtractConfirm() [line 176]

FILE: `frontend/src/pages/WeldmentResultsPage.jsx`
IMPORTS:
  React, { useState, useEffect } from 'react' [line 1]
  { [line 2]
  { DownloadOutlined, BarChartOutlined, CalculatorOutlined } from '@ant-design/icons' [line 17]
  { saveAs } from 'file-saver' [line 18]
  { getAnalysisResults } from '../services/api' [line 19]
  { useParams, useLocation, useNavigate } from 'react-router-dom' [line 20]
EXPORTS:
  WeldmentResultsPage [line 616]
FUNCTION WeldmentResultsPage() [line 24]
FUNCTION loadAnalysisResults() [line 56]
FUNCTION handleExportCSV() [line 90]
FUNCTION handleNavigateToBOMSavings() [line 198]

FILE: `frontend/src/services/api.js`
IMPORTS:
  axios from 'axios' [line 1]
EXPORTS:
  const uploadWeldments = async (formData) => { [line 64]
  const getWeldmentFiles = async () => { [line 80]
  const uploadBOMs = async (formData) => { [line 91]
  const getBOMFiles = async () => { [line 107]
  const analyzeDimensionalClustering = async (data) => { [line 118]
  const analyzeBOMSimilarity = async (data) => { [line 129]
  const getAnalysisResults = async (analysisId) => { [line 140]
  const healthCheck = async () => { [line 151]
  const getRecentAnalyses = async () => { [line 161]
  const analyzeWeldmentPairwise = async (data) => { [line 165]
  const calculateBOMSavings = async (formData) => { [line 176]
  const deleteAnalysis = async (analysisId) => { [line 192]
  const extractDimensions = async (formData) => { [line 202]
  const extractDimensionsBbox = async (formData) => { [line 209]
  const uploadPipes = async (formData) => { [line 217]
  const getPipeFiles = async () => { [line 233]
  const analyzePipePairwise = async (data) => { [line 243]
  const exportPipeReport = async (analysisId, mode = 'xyz_only', format = 'excel') => { [line 254]
  api [line 267]
FUNCTION uploadWeldments() [line 64]
FUNCTION getWeldmentFiles() [line 80]
FUNCTION uploadBOMs() [line 91]
FUNCTION getBOMFiles() [line 107]
FUNCTION analyzeDimensionalClustering() [line 118]
FUNCTION analyzeBOMSimilarity() [line 129]
FUNCTION getAnalysisResults() [line 140]
FUNCTION healthCheck() [line 151]
FUNCTION getRecentAnalyses() [line 161]
FUNCTION analyzeWeldmentPairwise() [line 165]
FUNCTION calculateBOMSavings() [line 176]
FUNCTION deleteAnalysis() [line 192]
FUNCTION extractDimensions() [line 202]
FUNCTION extractDimensionsBbox() [line 209]
FUNCTION uploadPipes() [line 217]
FUNCTION getPipeFiles() [line 233]
FUNCTION analyzePipePairwise() [line 243]
FUNCTION exportPipeReport() [line 254]

FILE: `frontend/src/services/auth.js`
IMPORTS:
  axios from "axios" [line 1]
EXPORTS:
  function signup(payload) { [line 17]
  function login({ email, password }) { [line 22]
  function getCurrentUser() { [line 27]
FUNCTION signup() [line 17]
FUNCTION login() [line 22]
FUNCTION getCurrentUser() [line 27]

FILE: `frontend/src/utils/dimensionExtraction.js`
EXPORTS:
  {flatToRows, rowsToFlat} [line 11]
FUNCTION flatToRows() [line 1]
FUNCTION rowsToFlat() [line 8]

FILE: `frontend/src/utils/helpers.js`
EXPORTS:
  const formatFileSize = (bytes) => { [line 2]
  const downloadCSV = (data, filename) => { [line 11]
  const formatPercent = (value) => { [line 25]
  const validateFileType = (file, allowedTypes) => { [line 30]
FUNCTION formatFileSize() [line 2]
FUNCTION downloadCSV() [line 11]
FUNCTION formatPercent() [line 25]
FUNCTION validateFileType() [line 30]

FILE: `frontend/vite.config.js`
IMPORTS:
  { defineConfig } from 'vite' [line 1]
  react from '@vitejs/plugin-react' [line 2]
EXPORTS:
  defineConfig({ [line 5]


---

# IMPORTANT PROJECT FILES

- `backend/pyproject.toml`
- `backend/requirements.txt`
- `frontend/package-lock.json`
- `frontend/package.json`
- `README.md`

---

# SCAN SUMMARY

- Total files scanned: **76**
- Python files: **17**
- JavaScript files: **29**
- Other files: **30**
- Ignored directories: `.git`, `node_modules`, virtual environments, caches, build directories, IDE folders, and other generated directories.

---

Generated automatically by AI Context Generator.