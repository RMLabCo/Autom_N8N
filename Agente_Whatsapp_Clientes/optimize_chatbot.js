const fs = require('fs');

const inputFile = 'd:\\RMLab_Antigravity_VF\\Autom_N8N\\Chatbot (5).json';
const outputFile = 'd:\\RMLab_Antigravity_VF\\Autom_N8N\\Chatbot_Optimized.json';

try {
    const rawData = fs.readFileSync(inputFile);
    const workflow = JSON.parse(rawData);

    // 1. Identify Key Nodes
    const guardarMsgNode = workflow.nodes.find(n => n.name === 'Guardar Msg Parcial');

    // 2. Update Guardar Msg Parcial Logic
    // Allow text from Media nodes (which output 'text' or 'caption') as fallback
    if (guardarMsgNode) {
        const columns = guardarMsgNode.parameters.columns.value;
        // Update expression to handle both text messages and media descriptions
        columns['Mensaje/Transcripción'] = '={{ $json.messages[0].text.body || $json.text || $json["Caption text"] || "Media without description" }}';

        // Add 'Procesado' column
        columns['Procesado'] = 'FALSE';

        // Update Schema
        guardarMsgNode.parameters.columns.schema.push({
            id: 'Procesado',
            displayName: 'Procesado',
            required: false,
            defaultMatch: false,
            display: true,
            type: 'string',
            canBeUsedToMatch: true
        });
    }

    // 3. Reroute Media Processing to Guardar Msg Parcial (Aggregation)
    // Nodes to reroute: 'Map text audio', 'Map image prompt', 'Prompt docs'
    // They currently point to 'Conocimiento_BD'. We want them to point to 'Guardar Msg Parcial'.

    const nodesToReroute = ['Map text audio', 'Map image prompt', 'Prompt docs'];

    // Remove existing connections FROM these nodes
    nodesToReroute.forEach(nodeName => {
        if (workflow.connections[nodeName]) {
            delete workflow.connections[nodeName];
        }
    });

    // Add new connections TO Guardar Msg Parcial
    // We need to find where Guardar Msg Parcial is connected FROM currently?
    // Currently 'Switch' connects to it.
    // We want 'Switch' (Text), AND 'Map...' (Media) to connect to it.

    // We update the connections object directly
    nodesToReroute.forEach(nodeName => {
        workflow.connections[nodeName] = {
            main: [
                [
                    {
                        node: 'Guardar Msg Parcial',
                        type: 'main',
                        index: 0
                    }
                ]
            ]
        };
    });

    // 4. Update 'Recuperar Msjs' (Google Sheets Read)
    // Add logic to filter only Unprocessed messages if possible?
    // Actually, the main fix is the Aggregation Rerouting.
    // User requested "Adjust the code".
    // Let's rely on the JS Code node 'Unir Msjs' to filter processed messages.

    const unirMsjsNode = workflow.nodes.find(n => n.name === 'Unir Msjs');
    if (unirMsjsNode) {
        // Update JS to filter by 'Procesado' column (assuming it exists in Sheet)
        // Original code filters by "Respuesta IA".
        // functionality update:
        let jsCode = unirMsjsNode.parameters.jsCode;

        // Replace current filter logic with check for 'Procesado'
        const newFilterLogic = `
// 2. FILTRO PROCESADO (Aggregated Logic)
// Filtramos filas que ya tienen 'Procesado' = TRUE
const userRows = rows.filter(item => {
  const processed = item.json["Procesado"];
  return processed !== "TRUE" && processed !== true;
});
`;
        // Replace the old userRows definition
        // We look for the "const userRows = ..." block
        jsCode = jsCode.replace(/const userRows = rows\.filter\(item => \{[\s\S]*?\}\);/, newFilterLogic);

        unirMsjsNode.parameters.jsCode = jsCode;
    }

    // 5. Add 'Marcar Procesado' Node
    // We need a Google Sheets Update node after 'Unir Msjs' (or rather, after processing).
    // The current flow ends at 'Route Types' -> 'IA Respuesta'.
    // We should mark processed AFTER 'Route Types' -> 'IA Respuesta' success? 
    // OR immediately after retrieving?
    // Let's add it after 'Unir Msjs' but passing through data.
    // Validating strict requirements: User wants "wait 10s -> process -> answer -> mark processed".

    // Simplest approach: Add 'Marcar Procesado' after 'Unir Msjs' before 'Route Types'.
    // It updates the retrieved rows to 'Procesado' = TRUE.

    const marcarProcesadoNode = {
        parameters: {
            operation: 'update',
            documentId: {
                __rl: true,
                value: '1iS1nC9O7a2N0ekFB6RXPqKjvT3n8Y2HpyRwH_cbPTg0',
                mode: 'list',
                cachedResultName: 'Log Chatbot Trancorvalle',
                cachedResultUrl: 'https://docs.google.com/spreadsheets/d/1iS1nC9O7a2N0ekFB6RXPqKjvT3n8Y2HpyRwH_cbPTg0/edit?usp=drivesdk'
            },
            sheetName: {
                __rl: true,
                value: 'gid=0',
                mode: 'list',
                cachedResultName: 'BD_Conversaciones',
                cachedResultUrl: 'https://docs.google.com/spreadsheets/d/1iS1nC9O7a2N0ekFB6RXPqKjvT3n8Y2HpyRwH_cbPTg0/edit#gid=0'
            },
            columns: {
                mappingMode: 'defineBelow',
                value: {
                    Procesado: 'TRUE'
                },
                matchingColumns: ['row_number'], // We need row_number from retrieval!
                schema: [
                    { id: 'Procesado', displayName: 'Procesado', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }
                ]
            },
            options: {}
        },
        id: 'mark-processed-node',
        name: 'Marcar Procesado',
        type: 'n8n-nodes-base.googleSheets',
        typeVersion: 4.7,
        position: [1200, 1072], // Approximate position after Unir Msjs
        credentials: {
            googleSheetsOAuth2Api: {
                id: 'ev9yj4hLTVffsiRE',
                name: 'Google Sheets - Trancorvalle'
            }
        }
    };

    workflow.nodes.push(marcarProcesadoNode);

    // Connect Unir Msjs -> Marcar Procesado
    // Connect Marcar Procesado -> Route Types (Original Unir Msjs target)

    // 1. Unir Msjs -> Marcar Procesado
    workflow.connections['Unir Msjs'] = {
        main: [[{ node: 'Marcar Procesado', type: 'main', index: 0 }]]
    };

    // 2. Marcar Procesado -> Route Types
    workflow.connections['Marcar Procesado'] = {
        main: [[{ node: 'Route Types', type: 'main', index: 0 }]]
    };

    fs.writeFileSync(outputFile, JSON.stringify(workflow, null, 2));
    console.log('Successfully optimized Chatbot flow!');

} catch (err) {
    console.error('Error processing JSON:', err);
    process.exit(1);
}
