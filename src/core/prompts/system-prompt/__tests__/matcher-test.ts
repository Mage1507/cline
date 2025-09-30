/**
 * Test to verify the new matcher-based variant selection works correctly
 */

import { ApiProviderInfo } from "@/core/api"
import { ModelFamily } from "@/shared/prompts"
import { VARIANT_CONFIGS } from "../variants"

// Mock provider info objects for testing
const mockProviderInfos: { name: string; providerInfo: ApiProviderInfo; expectedFamily: ModelFamily }[] = [
	{
		name: "GPT-5 model",
		providerInfo: {
			providerId: "openai",
			model: { id: "gpt-5", info: {} as any },
		},
		expectedFamily: ModelFamily.GPT_5,
	},
	{
		name: "Next-gen model",
		providerInfo: {
			providerId: "anthropic",
			model: { id: "claude-3.5-sonnet-20241022", info: {} as any },
		},
		expectedFamily: ModelFamily.NEXT_GEN,
	},
	{
		name: "Compact local model",
		providerInfo: {
			providerId: "ollama",
			model: { id: "llama-3.2-1b", info: {} as any },
			customPrompt: "compact",
		},
		expectedFamily: ModelFamily.XS,
	},
	{
		name: "Generic model",
		providerInfo: {
			providerId: "openai",
			model: { id: "gpt-3.5-turbo", info: {} as any },
		},
		expectedFamily: ModelFamily.GENERIC,
	},
]

/**
 * Test the matcher logic for each variant
 */
export function testVariantMatching() {
	console.log("🧪 Testing variant matching logic...")

	for (const { name, providerInfo, expectedFamily } of mockProviderInfos) {
		console.log(`\n📝 Testing: ${name}`)
		console.log(`   Model: ${providerInfo.model.id}`)
		console.log(`   Provider: ${providerInfo.providerId}`)
		console.log(`   Custom Prompt: ${providerInfo.customPrompt || "none"}`)
		console.log(`   Expected Family: ${expectedFamily}`)

		let matchedFamily: ModelFamily | null = null

		// Test each variant's matcher function
		for (const [familyId, config] of Object.entries(VARIANT_CONFIGS)) {
			try {
				if (config.matcher(providerInfo)) {
					matchedFamily = familyId as ModelFamily
					console.log(`   ✅ Matched: ${familyId}`)
					break
				}
			} catch (error) {
				console.log(`   ❌ Matcher error for ${familyId}: ${error}`)
			}
		}

		// Check if the match is correct
		if (matchedFamily === expectedFamily) {
			console.log(`   🎯 PASS: Correctly matched ${expectedFamily}`)
		} else {
			console.log(`   🚨 FAIL: Expected ${expectedFamily}, got ${matchedFamily || "null"}`)
		}
	}

	console.log("\n✨ Variant matching test completed!")
}

// Export for potential use in other tests
export { mockProviderInfos }
