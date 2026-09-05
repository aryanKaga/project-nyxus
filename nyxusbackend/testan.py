from openai import OpenAI

# Initialize the OpenAI client with NVIDIA's base URL
client = OpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key="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"  # Replace with your 'nvapi-...' key
)

# -------------------------------------------------------------
# 1. DeepSeek V4 Pro (Flagship Reasoning & Complex Logic)
# -------------------------------------------------------------
def run_deepseek_v4_pro(prompt: str):
    response = client.chat.completions.create(
        model="deepseek-ai/deepseek-v4-pro-0813",  # Updated to match your exact model string
        messages=[{"role": "user", "content": prompt}],
        temperature=0.6,
        top_p=0.95,
        max_tokens=4096,
        stream=False
    )
    return response.choices[0].message.content

# -------------------------------------------------------------
# 2. NVIDIA Nemotron 3 Ultra 550B (Enterprise Workflows & Planning)
# -------------------------------------------------------------
def run_nemotron_550b(prompt: str):
    response = client.chat.completions.create(
        model="nvidia/nemotron-3-ultra-550b-a55b",  # Matches your model catalog
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        top_p=0.7,
        max_tokens=4096,
        stream=False
    )
    return response.choices[0].message.content

# Example Execution
if __name__ == "__main__":
    # Test DeepSeek V4 Pro
    logic_prompt = "Solve step-by-step: A car travels 60 mph for 2 hours, then 80 mph for 3 hours. What is the average speed?"
    print("=== DeepSeek V4 Pro Output ===")
    print(run_deepseek_v4_pro(logic_prompt))

    # Test Nemotron 3 Ultra 550B
    agent_prompt = "Design a detailed multi-step backend deployment failure recovery plan."
    print("\n=== Nemotron 3 Ultra 550B Output ===")
    print(run_nemotron_550b(agent_prompt))