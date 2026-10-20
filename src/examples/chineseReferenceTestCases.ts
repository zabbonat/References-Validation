/**
 * Concrete Worked Examples & Runnable End-to-End Test Suite
 * Demonstrates the 3-step pipeline for Chinese / Domestic Non-DOI Reference Detection
 * and OpenAlex Cascading Fallback in CheckIfExist:
 *   Raw String -> Step 1: Heuristic Detection -> Step 2: CrossRef + OpenAlex Fallback -> Step 3: Granular UI Status
 */

import {
    detectDomesticReferenceHeuristics,
    cleanTitleForAPISearch,
    type DomesticSourceFlags
} from '../utils/referenceHeuristics';
import {
    checkWithFallback,
    DOMESTIC_TRANSLATED_TOOLTIP,
    type CheckResult,
    type ValidationResolutionState
} from '../services/SearchService';
import { parsePlainTextRef } from '../services/PlainTextParser';

export interface ChineseReferenceTestCase {
    id: 'CASE_A' | 'CASE_B' | 'CASE_C';
    caseLabel: string;
    description: string;
    rawReference: string;
    expectedHeuristics: {
        isSuspectedChineseOrDomestic: boolean;
        hasChineseMarkers: boolean;
        hasGBT7714Markers: boolean;
        hasCJKCharacters: boolean;
        isTypicalChineseUniversityJournal: boolean;
        expectedMarkerSubstrings: string[];
    };
    expectedResolutionState: ValidationResolutionState;
    uiBadgeColor: 'teal' | 'amber' | 'red';
    uiBadgeText: string;
    expectedTooltip?: string;
    workflowTrace: {
        step1PreProcessing: string;
        step2CrossRefAttempt: string;
        step2OpenAlexFallback: string;
        step3FinalResolution: string;
    };
}

export const CHINESE_REFERENCE_TEST_CASES: ChineseReferenceTestCase[] = [
    {
        id: 'CASE_A',
        caseLabel: 'Case A (Verified via OpenAlex)',
        description:
            'A real Chinese journal article indexed in OpenAlex/MAG without a standard CrossRef DOI match, formatted with GB/T 7714 [J] identifier.',
        rawReference:
            'Wang, Y., & Liu, H. (2021). Research on the impact of digital economy on high-quality development of manufacturing industry [J]. Journal of Quantitative & Technological Economics, 38(11), 23-41.',
        expectedHeuristics: {
            isSuspectedChineseOrDomestic: true,
            hasChineseMarkers: false,
            hasGBT7714Markers: true,
            hasCJKCharacters: false,
            isTypicalChineseUniversityJournal: false,
            expectedMarkerSubstrings: ['GB/T-7714 [J]']
        },
        expectedResolutionState: 'VERIFIED_OPENALEX',
        uiBadgeColor: 'teal',
        uiBadgeText: 'VERIFIED_OPENALEX',
        workflowTrace: {
            step1PreProcessing:
                'Detects GB/T-7714 "[J]" marker -> sets isSuspectedChineseOrDomestic = true and strips "[J]" from search title.',
            step2CrossRefAttempt:
                'Queries CrossRef API -> returns Not Found / low title confidence because domestic CNKI/CSSCI record has no CrossRef DOI.',
            step2OpenAlexFallback:
                'Triggers cascading fallback to OpenAlex API (filter=title.search:...,publication_year:2021) -> matches indexed MAG/CNKI record and verifies Pinyin author surnames (Wang, Liu).',
            step3FinalResolution:
                'Resolves to VERIFIED_OPENALEX (Teal/Blue UI badge) with OpenAlex metadata and citation formatting.'
        }
    },
    {
        id: 'CASE_B',
        caseLabel: 'Case B (Amber Warning - Unverifiable Domestic/Translated)',
        description:
            'A translated Chinese citation with GB/T 7714 [J] marker, typical Chinese university journal edition name, and explicit [in Chinese] tag that cannot be verified on international registries.',
        rawReference:
            'Zhang, L., & Wang, Y. (2023). Digital transformation and enterprise innovation performance [J]. Journal of Peking University (Philosophy and Social Sciences Edition), 60(4), 112-125. [in Chinese]',
        expectedHeuristics: {
            isSuspectedChineseOrDomestic: true,
            hasChineseMarkers: true,
            hasGBT7714Markers: true,
            hasCJKCharacters: false,
            isTypicalChineseUniversityJournal: true,
            expectedMarkerSubstrings: [
                'GB/T-7714 [J]',
                'Explicit [in Chinese] tag',
                'Chinese university journal pattern'
            ]
        },
        expectedResolutionState: 'WARNING_DOMESTIC_TRANSLATED',
        uiBadgeColor: 'amber',
        uiBadgeText: 'WARNING_DOMESTIC_TRANSLATED',
        expectedTooltip: DOMESTIC_TRANSLATED_TOOLTIP,
        workflowTrace: {
            step1PreProcessing:
                'Detects 3 domestic markers: GB/T-7714 "[J]", explicit "[in Chinese]" tag, and "Journal of Peking University (Philosophy and Social Sciences Edition)" pattern -> sets isSuspectedChineseOrDomestic = true.',
            step2CrossRefAttempt:
                'Queries CrossRef API with cleaned title -> fails to find matching Peking University journal article.',
            step2OpenAlexFallback:
                'Triggers OpenAlex API fallback -> fails to find a verified record matching the custom-translated title and domestic venue.',
            step3FinalResolution:
                'Because isSuspectedChineseOrDomestic === true, assigns WARNING_DOMESTIC_TRANSLATED (Amber/Orange UI badge + domestic source tooltip) instead of flagging as a standard Western hallucination.'
        }
    },
    {
        id: 'CASE_C',
        caseLabel: 'Case C (Red Alert - Pure LLM Hallucination)',
        description:
            'A fabricated Western biomedical journal citation generated by an LLM that fails both CrossRef and OpenAlex APIs and has no domestic/translation markers.',
        rawReference:
            'Thompson, R. J., & Miller, K. S. (2023). Quantum-enhanced transformer architectures for autonomous neural synthesis in clinical genomics. Journal of Advanced Computational Biomedicine, 18(4), 412-429.',
        expectedHeuristics: {
            isSuspectedChineseOrDomestic: false,
            hasChineseMarkers: false,
            hasGBT7714Markers: false,
            hasCJKCharacters: false,
            isTypicalChineseUniversityJournal: false,
            expectedMarkerSubstrings: []
        },
        expectedResolutionState: 'UNVERIFIED_HIGH_RISK',
        uiBadgeColor: 'red',
        uiBadgeText: 'UNVERIFIED_HIGH_RISK',
        workflowTrace: {
            step1PreProcessing:
                'Scans reference for GB/T 7714, CJK characters, [in Chinese] tags, and Chinese university journal conventions -> none found (isSuspectedChineseOrDomestic = false).',
            step2CrossRefAttempt:
                'Queries CrossRef API -> Not Found (0 matching articles for fabricated title and non-existent journal).',
            step2OpenAlexFallback:
                'Triggers OpenAlex API fallback -> Not Found across 250M+ works.',
            step3FinalResolution:
                'Resolves to UNVERIFIED_HIGH_RISK (Red UI badge) indicating high probability of LLM citation hallucination.'
        }
    }
];

/**
 * Ready-to-use multi-line string for the UI Batch Demo button
 */
export const CHINESE_FALLBACK_DEMO_BATCH = CHINESE_REFERENCE_TEST_CASES.map(
    (tc, idx) => `[${idx + 1}] ${tc.rawReference}`
).join('\n\n');

export interface TestCaseExecutionReport {
    id: string;
    caseLabel: string;
    rawReference: string;
    cleanedTitle: string;
    heuristics: DomesticSourceFlags;
    result: CheckResult;
    passedHeuristics: boolean;
    passedResolutionState: boolean;
}

/**
 * Self-contained runner that executes all 3 test cases through the live pipeline
 * and verifies both Step 1 heuristic flags and Step 3 resolution states.
 */
export const runChineseReferenceTestSuite = async (): Promise<TestCaseExecutionReport[]> => {
    const reports: TestCaseExecutionReport[] = [];

    for (const tc of CHINESE_REFERENCE_TEST_CASES) {
        const parsed = parsePlainTextRef(tc.rawReference);
        const cleanedTitle = cleanTitleForAPISearch(parsed.title || tc.rawReference);
        const heuristics = detectDomesticReferenceHeuristics(tc.rawReference, {
            title: parsed.title,
            authors: parsed.authors,
            journal: parsed.journal,
            year: parsed.year
        });

        const searchQuery = `${parsed.title || ''} ${parsed.authors || ''}`.trim() || tc.rawReference;
        const result = await checkWithFallback(
            searchQuery,
            {
                title: parsed.title,
                authors: parsed.authors,
                journal: parsed.journal,
                year: parsed.year
            },
            tc.rawReference
        );

        const passedHeuristics =
            heuristics.isSuspectedChineseOrDomestic === tc.expectedHeuristics.isSuspectedChineseOrDomestic &&
            heuristics.hasChineseMarkers === tc.expectedHeuristics.hasChineseMarkers &&
            heuristics.hasGBT7714Markers === tc.expectedHeuristics.hasGBT7714Markers &&
            heuristics.hasCJKCharacters === tc.expectedHeuristics.hasCJKCharacters &&
            heuristics.isTypicalChineseUniversityJournal === tc.expectedHeuristics.isTypicalChineseUniversityJournal;

        const passedResolutionState = result.resolutionState === tc.expectedResolutionState;

        reports.push({
            id: tc.id,
            caseLabel: tc.caseLabel,
            rawReference: tc.rawReference,
            cleanedTitle,
            heuristics,
            result,
            passedHeuristics,
            passedResolutionState
        });
    }

    return reports;
};
