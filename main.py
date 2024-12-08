from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn

from tools import get_current_weather, get_system_time
from langchain_ollama import ChatOllama
from langchain_core.messages import AIMessage
from langchain_core.prompts import PromptTemplate

prompt = PromptTemplate(
    template="""
    <|begin_of_text|>
    <|start_header_id|>system<|end_header_id|>
        You are a smart Agent.
        You are a master at understanding what a customer wants and utilize available tools only if you have to.
    <|eot_id|>
    <|start_header_id|>user<|end_header_id|>
        Conduct a comprehensive analysis of the request provided.
        USER REQUEST:\n\n {initial_request} \n\n
    <|eot_id|>
    <|start_header_id|>assistant<|end_header_id|>
    """,
    input_variables=["initial_request"],
)

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

@app.post("/benchmark")
async def benchmark(req: BenchmarkRequest):
    if not req.base_url or not req.model_name or not req.sentence:
        return JSONResponse(status_code=400, content={"success": False, "error": "Invalid input parameters."})

    try:
        model = ChatOllama(
            base_url=req.base_url,
            model=req.model_name,
            format="json"
        )
    except Exception as e:
        return JSONResponse(status_code=500, content={
            "success": False,
            "sentence": req.sentence,
            "error": f"Failed to initialize model: {str(e)}"
        })

    model_with_tools = model.bind_tools(
        tools=[get_current_weather, get_system_time],
    )
    agent_request_generator = prompt | model_with_tools

    try:
        result = agent_request_generator.invoke({"initial_request": req.sentence})
    except Exception as e:
        return JSONResponse(status_code=500, content={
            "success": False,
            "sentence": req.sentence,
            "error": f"Model invocation failed: {str(e)}"
        })

    if not isinstance(result, AIMessage):
        return {
            "success": False,
            "sentence": req.sentence,
            "error": "No valid AIMessage response from model."
        }

    model_response = result.content.strip() if result.content else ""
    tool_calls_data = []
    success = True

    if hasattr(result, 'tool_calls') and result.tool_calls:
        for tc in result.tool_calls:
            tool_name = tc["name"]
            tool_args = tc["args"]
            try:
                tool_output = tool_mapping[tool_name].invoke(tool_args)
            except Exception as e:
                tool_output = f"Tool execution error: {str(e)}"
                success = False

            # If tool output indicates an error, success = False
            if "Tool execution error" in tool_output:
                success = False

            tool_calls_data.append({
                "name": tool_name,
                "args": tool_args,
                "output": tool_output
            })

    # Determine final success:
    # Case 1: model_response is non-empty => success
    # Case 2: If model_response is empty, but we have at least one tool call that succeeded (no error) and non-empty output => success
    # Otherwise => failure

    # Check if there's any successful tool output
    successful_tool_output = any(
        tc["output"] and "Tool execution error" not in tc["output"] 
        for tc in tool_calls_data
    )

    # If model_response empty, rely on tool output
    if model_response == "":
        if not successful_tool_output:
            success = False

    # If already marked success=false due to errors, keep it false
    # Otherwise success remains true

    if not success:
        return {
            "success": False,
            "sentence": req.sentence,
            "tool_calls": tool_calls_data,
            "model_response": model_response,
            "error": "No successful response or tool execution."
        }

    return {
        "success": True,
        "sentence": req.sentence,
        "tool_calls": tool_calls_data,
        "model_response": model_response
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8090)
