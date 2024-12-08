document.addEventListener('DOMContentLoaded', () => {
    const llm1BaseURLInput = document.getElementById('llm1BaseURL');
    const llm1ModelNameInput = document.getElementById('llm1ModelName');
    const llm2BaseURLInput = document.getElementById('llm2BaseURL');
    const llm2ModelNameInput = document.getElementById('llm2ModelName');
    const testSuiteSizeInput = document.getElementById('testSuiteSize');
    const generateSentencesBtn = document.getElementById('generateSentencesBtn');
    const startBenchmarkBtn = document.getElementById('startBenchmarkBtn');
    const sentencesTableBody = document.querySelector('#sentencesTable tbody');

    const llm1ProgressText = document.getElementById('llm1ProgressText');
    const llm1ProgressBar = document.getElementById('llm1ProgressBar');
    const llm1SuccessCountElem = document.getElementById('llm1SuccessCount');
    const llm1FailureCountElem = document.getElementById('llm1FailureCount');
    const llm1Results = document.getElementById('llm1Results');
    const llm1AvgTimeElem = document.getElementById('llm1AvgTime');

    const llm2Section = document.getElementById('llm2Section');
    const llm2ProgressText = document.getElementById('llm2ProgressText');
    const llm2ProgressBar = document.getElementById('llm2ProgressBar');
    const llm2SuccessCountElem = document.getElementById('llm2SuccessCount');
    const llm2FailureCountElem = document.getElementById('llm2FailureCount');
    const llm2Results = document.getElementById('llm2Results');
    const llm2AvgTimeElem = document.getElementById('llm2AvgTime');

    const totalTimeElem = document.getElementById('totalTime');

    let testSentences = [];
    const citiesAndStates = [
        "New York, NY", "Los Angeles, CA", "Chicago, IL", "Houston, TX",
        "Miami, FL", "San Francisco, CA", "Seattle, WA", "Boston, MA",
        "Austin, TX", "Denver, CO", "Philadelphia, PA", "Phoenix, AZ",
        "Dallas, TX", "San Diego, CA", "Atlanta, GA", "Washington D.C., DC",
        "Orlando, FL", "Nashville, TN", "Minneapolis, MN", "Las Vegas, NV"
    ];
    const specificRequests = [
        "What is the weather today in [location]?",
        "Can you tell me the forecast for tomorrow in [location]?",
        "How's the weather in [location] today?",
        "What's the temperature like right now in [location]?",
        "Tell me about the conditions for tonight in [location]?",
        "Is it going to rain tomorrow in [location]?"
    ];

    function randomChoice(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    generateSentencesBtn.addEventListener('click', () => {
        const size = parseInt(testSuiteSizeInput.value, 10);
        if (isNaN(size) || size < 1) {
            alert("Please enter a valid test suite size.");
            return;
        }

        testSentences = [];
        sentencesTableBody.innerHTML = '';
        for (let i = 0; i < size; i++) {
            const sentenceTemplate = randomChoice(specificRequests);
            const location = randomChoice(citiesAndStates);
            const sentence = sentenceTemplate.replace("[location]", location);
            testSentences.push(sentence);
        }

        testSentences.forEach((s, index) => {
            const row = document.createElement('tr');
            const idxCell = document.createElement('td');
            idxCell.textContent = index + 1;
            const sentenceCell = document.createElement('td');
            sentenceCell.textContent = s;
            row.appendChild(idxCell);
            row.appendChild(sentenceCell);
            sentencesTableBody.appendChild(row);
        });

        startBenchmarkBtn.disabled = false;
    });

    startBenchmarkBtn.addEventListener('click', async () => {
        startBenchmarkBtn.disabled = true;

        const llm1Base = llm1BaseURLInput.value.trim();
        const llm1Model = llm1ModelNameInput.value.trim();
        const llm2Base = llm2BaseURLInput.value.trim();
        const llm2Model = llm2ModelNameInput.value.trim();

        if (!llm1Base || !llm1Model) {
            alert("Please provide at least LLM 1 Base URL and Model Name.");
            startBenchmarkBtn.disabled = false;
            return;
        }

        // Reset UI counters and results
        resetLLMResults(1);
        resetLLMResults(2);

        // If no LLM2 provided, hide LLM2 section
        if (!llm2Base || !llm2Model) {
            llm2Section.style.display = "none";
        } else {
            llm2Section.style.display = "block";
        }

        const startTime = performance.now();

        // Run benchmarks
        const tasks = [];
        tasks.push(runBenchmarkForLLM(1, llm1Base, llm1Model, testSentences));
        if (llm2Base && llm2Model) {
            tasks.push(runBenchmarkForLLM(2, llm2Base, llm2Model, testSentences));
        }

        // Wait for all to complete
        await Promise.all(tasks);

        const endTime = performance.now();
        const totalTime = endTime - startTime;
        totalTimeElem.textContent = `${totalTime.toFixed(2)} ms`;
    });

    function resetLLMResults(llmNumber) {
        if (llmNumber === 1) {
            llm1SuccessCountElem.textContent = '0';
            llm1FailureCountElem.textContent = '0';
            llm1ProgressText.textContent = '0%';
            llm1ProgressBar.style.width = '0%';
            llm1Results.innerHTML = '';
            llm1AvgTimeElem.textContent = '0 ms';
        } else {
            llm2SuccessCountElem.textContent = '0';
            llm2FailureCountElem.textContent = '0';
            llm2ProgressText.textContent = '0%';
            llm2ProgressBar.style.width = '0%';
            llm2Results.innerHTML = '';
            llm2AvgTimeElem.textContent = '0 ms';
        }
    }

    async function runBenchmarkForLLM(llmNumber, baseURL, modelName, sentences) {
        let successCount = 0;
        let failureCount = 0;
        let totalResponseTime = 0;

        // Process each sentence sequentially
        for (let i = 0; i < sentences.length; i++) {
            const sentence = sentences[i];
            highlightSentence(i, true); // highlight row being processed

            const payload = {
                base_url: baseURL,
                model_name: modelName,
                sentence: sentence
            };

            const start = performance.now();
            let data;
            try {
                const response = await fetch('/benchmark', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                data = await response.json();
            } catch (err) {
                data = { success: false, sentence, error: err.message };
            }
            const end = performance.now();
            const elapsed = end - start;
            totalResponseTime += elapsed;

            let resultElement = document.createElement('li');
            resultElement.classList.add('list-group-item');

            if (data.success) {
                successCount++;
                resultElement.innerHTML = `<strong>Sentence:</strong> ${data.sentence}<br>
                                           <strong>Time:</strong> ${elapsed.toFixed(2)} ms<br>
                                           <strong>Model Response:</strong> ${data.model_response}<br>
                                           <strong>Tool Calls:</strong> <pre>${JSON.stringify(data.tool_calls, null, 2)}</pre>`;
                highlightSentence(i, false, true);
            } else {
                failureCount++;
                resultElement.innerHTML = `<strong>Sentence:</strong> ${data.sentence}<br>
                                           <strong>Time:</strong> ${elapsed.toFixed(2)} ms<br>
                                           <strong>Error:</strong> ${data.error || 'Unknown error'}`;
                highlightSentence(i, false, false);
            }

            if (llmNumber === 1) {
                llm1Results.appendChild(resultElement);
                llm1SuccessCountElem.textContent = successCount;
                llm1FailureCountElem.textContent = failureCount;
                updateProgressBar(llm1ProgressBar, llm1ProgressText, (i+1), sentences.length);
                llm1AvgTimeElem.textContent = `${(totalResponseTime/(i+1)).toFixed(2)} ms`;
            } else {
                llm2Results.appendChild(resultElement);
                llm2SuccessCountElem.textContent = successCount;
                llm2FailureCountElem.textContent = failureCount;
                updateProgressBar(llm2ProgressBar, llm2ProgressText, (i+1), sentences.length);
                llm2AvgTimeElem.textContent = `${(totalResponseTime/(i+1)).toFixed(2)} ms`;
            }
        }
    }

    function highlightSentence(index, processing, success = null) {
        const rows = sentencesTableBody.querySelectorAll('tr');
        const row = rows[index];
        if (!row) return;

        row.classList.remove('highlight-processing', 'highlight-completed-success', 'highlight-completed-failure');

        if (processing) {
            row.classList.add('highlight-processing');
        } else {
            if (success === true) {
                row.classList.add('highlight-completed-success');
            } else {
                row.classList.add('highlight-completed-failure');
            }
        }
    }

    function updateProgressBar(barElem, textElem, processed, total) {
        const percent = Math.round((processed / total) * 100);
        barElem.style.width = percent + '%';
        textElem.textContent = percent + '%';
    }

});
