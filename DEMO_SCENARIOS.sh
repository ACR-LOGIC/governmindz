#!/bin/bash
# Governmindz Hackathon Demo Script
# Run these commands to showcase your agent to judges

# Color codes for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

cd "C:\Users\omg\governmindz"

echo -e "${BLUE}===========================================================${NC}"
echo -e "${BLUE}GOVERNMINDZ HACKATHON DEMO: Multi-Source Data Governance${NC}"
echo -e "${BLUE}===========================================================${NC}"
echo ""

# Demo 1: Regulatory Risk Analysis
echo -e "${GREEN}[DEMO 1] Regulatory Risk Analysis${NC}"
echo -e "${YELLOW}Showcases: Zetaris joining SEC_DATA + GLEIF_REST + COMPANY_DNS${NC}"
echo ""
echo "Setting topic: Multi-source company risk assessment..."
set GOVERNMINDZ_TOPIC="Our organization received acquisition offers from 7 Fortune 500 companies (Apple, IBM, Oracle, Walmart, Target, Ford, Tesla). Before we accept any partnership, we need to assess regulatory compliance risk. Use Zetaris to cross-reference: (1) SEC financial data (revenue volatility, reporting consistency), (2) GLEIF legal entity status (LEI active/inactive), (3) COMPANY_DNS industry classification. Which company poses the HIGHEST compliance risk, and why? Rank all 7 companies by governance risk."
npm run demo

echo ""
echo -e "${GREEN}[DEMO 2] PII Re-identification Risk${NC}"
echo -e "${YELLOW}Showcases: Zetaris joining NY_TAXI multi-table data${NC}"
echo ""
echo "Setting topic: Privacy risk assessment..."
set GOVERNMINDZ_TOPIC="We want to share NY_TAXI operational data with a research team to study transportation patterns. However, we have serious concerns about PII exposure. Zetaris, cross-reference taxi_trips with drivers table to calculate: (1) how many trips does each driver have? (2) which zones do they work? (3) what's their estimated earnings? Create a 'PII exposure score' for each driver (how easily can they be re-identified?) and recommend which drivers' data is safe to share, and which requires de-identification or blocking. What governance policy should we implement?"
npm run demo

echo ""
echo -e "${GREEN}[DEMO 3] Clinical Trial + Drug Safety Alignment${NC}"
echo -e "${YELLOW}Showcases: Zetaris joining healthcare data sources${NC}"
echo ""
echo "Setting topic: Healthcare compliance..."
set GOVERNMINDZ_TOPIC="We're evaluating whether to partner with pharmaceutical companies conducting clinical trials. Before we grant them access to our data, we need to ensure trial integrity. Zetaris, join CLINICALTRIALS_REST (ibuprofen studies) with OPENFDA_REST (FDA drug approval + adverse reactions). Analysis: (1) What ibuprofen trials are currently active? (2) Do they match FDA labeling for indications and warnings? (3) Are there known adverse reactions in FDA data that trials aren't monitoring? (4) What governance risk does data inconsistency create? Which trials can we trust, and which need additional review?"
npm run demo

echo ""
echo -e "${GREEN}[DEMO 4] Data Reconciliation Audit${NC}"
echo -e "${YELLOW}Showcases: Zetaris cross-source reconciliation for data quality${NC}"
echo ""
echo "Setting topic: Data reconciliation..."
set GOVERNMINDZ_TOPIC="We need to reconcile company identities across three authoritative sources: SEC uses CIK identifiers, GLEIF uses LEI codes, COMPANY_DNS uses SIC codes. For the 7 companies in our database: (1) Which have exact name matches across all three sources? (2) Which have data inconsistencies or missing records? (3) What governance implications does this create for our data policy? Use Zetaris to perform the reconciliation. Where is our data unreliable, and what's our compliance risk?"
npm run demo

echo ""
echo -e "${GREEN}[DEMO 5] Enterprise Risk Scorecard${NC}"
echo -e "${YELLOW}Showcases: Zetaris multi-dimensional risk aggregation${NC}"
echo ""
echo "Setting topic: Comprehensive risk scoring..."
set GOVERNMINDZ_TOPIC="Create an enterprise governance risk scorecard for all companies in our database. For each company, calculate a composite risk score across four dimensions: (1) Financial Risk (revenue volatility, debt levels), (2) Legal/Compliance Risk (LEI status, registration gaps), (3) Industry Risk (regulatory burden from SIC classification), (4) Data Quality Risk (missing/inconsistent records). Zetaris should join SEC_DATA + GLEIF_REST + COMPANY_DNS and produce a risk-ranked company list. Recommend data access policy (FULL_ACCESS, CONDITIONAL, RESTRICTED) for each company."
npm run demo

echo ""
echo -e "${BLUE}===========================================================${NC}"
echo -e "${BLUE}Demo Complete!${NC}"
echo -e "${BLUE}===========================================================${NC}"
echo ""
echo -e "${YELLOW}To view the audit trail with cryptographic proof:${NC}"
echo "  cat logs/hackathon-submission.jsonl"
echo ""
echo -e "${YELLOW}To test the interactive web UI:${NC}"
echo "  npm run web"
echo "  # Open http://127.0.0.1:8787"
echo ""
