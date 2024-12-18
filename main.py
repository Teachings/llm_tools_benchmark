import time
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn

from tools import get_current_weather, get_system_time
from langchain.prompts import ChatPromptTemplate, SystemMessagePromptTemplate, HumanMessagePromptTemplate
from langchain_ollama import ChatOllama
from langchain_core.messages import AIMessage

# Define the system message
system_message = SystemMessagePromptTemplate.from_template(
    "You are an intelligent assistant designed to analyze user requests accurately. "
    "You must:\n"
    "- Always analyze the user's request to understand its intent.\n"
    "- Only use available tools when the request explicitly requires external information or actions you cannot perform directly.\n"
    "- Avoid using tools for general questions or tasks you can handle without external assistance (e.g., answering general knowledge questions, casual conversations, or creative requests).\n"
    "- When using a tool, ensure it is relevant to the request and provide the necessary arguments accurately.\n"
    "- Do not invoke a tool if it is not listed in your available tools.\n"
    "- Your available tools are:\n"
    "  - `get_current_weather`: Provides the current weather information for a specified location.\n"
    "  - `get_system_time`: Provides the current system time.\n"
    "- If no tools are needed or the requested tool is unavailable, respond directly to the user's request without invoking any tools."
)

user_message = HumanMessagePromptTemplate.from_template(
    "Conduct a comprehensive analysis of the request provided.\n"
    "USER REQUEST:\n\n{initial_request}\n\n"
)

chat_prompt = ChatPromptTemplate.from_messages([system_message, user_message])
tool_mapping = {
    'get_current_weather': get_current_weather,
    'get_system_time': get_system_time,
}

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def serve_index():
    return FileResponse("static/index.html")

class BenchmarkRequest(BaseModel):
    base_url: str
    model_name: str
    sentence: str
    expected_tool: str = None  # New parameter added

@app.post("/benchmark")
async def benchmark(req: BenchmarkRequest):
    start_time = time.time()  # Start timing on the backend

    if not req.base_url or not req.model_name or not req.sentence:
        return JSONResponse(status_code=400, content={"success": False, "error": "Invalid input parameters."})

    try:
        model = ChatOllama(
            base_url=req.base_url,
            model=req.model_name,
            format="json"
        )
    except Exception as e:
        return build_response(success=False, req=req, error=f"Failed to initialize model: {str(e)}", start_time=start_time)

    model_with_tools = model.bind_tools(
        tools=[get_current_weather, get_system_time],
    )
    agent_request_generator = chat_prompt | model_with_tools

    try:
        result = agent_request_generator.invoke({"initial_request": req.sentence})
    except Exception as e:
        return build_response(success=False, req=req, error=f"Model invocation failed: {str(e)}", start_time=start_time)

    if not isinstance(result, AIMessage):
        return build_response(success=False, req=req, error="No valid AIMessage response from model.", start_time=start_time)

    model_response = result.content.strip() if result.content else ""
    tool_calls_data = []
    success = True

    if hasattr(result, 'tool_calls') and result.tool_calls:
        for tc in result.tool_calls:
            tool_name = tc.get("name", "").lower()

            if req.expected_tool:
                if req.expected_tool.lower() == "none":
                    if tool_name and tool_name != "none":
                        success = False
                        tool_calls_data.append({
                            "name": tc.get("name", ""),
                            "args": tc.get("args", {}),
                            "output": "Tool execution error :: Tool call was not required, tool execution skipped."
                        })
                        break
                elif req.expected_tool.lower() != tool_name:
                    success = False
                    tool_calls_data.append({
                        "name": tc.get("name", ""),
                        "args": tc.get("args", {}),
                        "output": "Tool execution error :: Wrong tool called, tool execution skipped."
                    })
                    break

            try:
                tool_output = tool_mapping[tool_name].invoke(tc.get("args", {})) if tool_name and tool_name != "none" else ""
            except Exception as e:
                tool_output = f"Tool execution error: {str(e)}"
                success = False
            if "Tool execution error" in tool_output:
                success = False
            tool_calls_data.append({
                "name": tc.get("name", ""),
                "args": tc.get("args", {}),
                "output": tool_output
            })

    if req.expected_tool and req.expected_tool.lower() == "none" and all(not tc.get("name", "") or tc.get("name", "").lower() == "none" for tc in result.tool_calls):
        success = True

    successful_tool_output = any(
        tc["output"] and "Tool execution error" not in tc["output"] 
        for tc in tool_calls_data
    )

    if model_response == "" and not successful_tool_output and req.expected_tool and req.expected_tool.lower() != "none":
        success = False

    return build_response(success=success, req=req, model_response=model_response, tool_calls_data=tool_calls_data, start_time=start_time)

def build_response(success: bool, req: BenchmarkRequest, error: str = None, model_response: str = "", tool_calls_data: list = None, start_time: float = None):
    end_time = time.time()
    response = {
        "success": success,
        "sentence": req.sentence,
        "tool_calls": tool_calls_data or [],
        "model_response": model_response,
        "time_taken": int((end_time - start_time) * 1000) if start_time else 0
    }
    if error:
        response["error"] = error
    return JSONResponse(status_code=200 if success else 500, content=response)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8090)
