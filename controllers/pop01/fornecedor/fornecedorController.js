const db = require('../../../config/db');
const { hasPending, deleteItem } = require('../../../config/defaultConfig');

class FornecedorController {
    async getData(req, res) {
        const functionName = req.headers['function-name'];
        const unidadeID = req.params.id

        switch (functionName) {
            case 'getList':
                db.query("SELECT fornecedorID AS id, cnpj, nomeFantasia, cidade, estado, telefone, status FROM fornecedor WHERE unidadeID = ?", [unidadeID], (err, result) => {
                    if (err) { res.status(500).json(err); }

                    res.status(200).json(result);
                })
                break;

            case 'getData':
                const { id } = req.params

                // Fields do header
                const sqlFields = `
                SELECT * 
                FROM par_fornecedor AS pf 
                    JOIN par_fornecedor_unidade AS pfu ON (pf.parFornecedorID = pfu.parFornecedorID) 
                WHERE pfu.unidadeID = ? 
                ORDER BY pf.ordem ASC`
                const [resultFields] = await db.promise().query(sqlFields, [unidadeID])
                if (resultFields.length === 0) { res.status(500).json('Error'); }

                // Varrer result, pegando nomeColuna e inserir em um array 
                const columns = resultFields.map(row => row.nomeColuna);

                // Montar select na tabela fornecedor, onde as colunas do select serão as colunas do array columns
                const sqlData = `SELECT ${columns.join(', ')} FROM fornecedor WHERE fornecedorID = ?`;
                const [resultData] = await db.promise().query(sqlData, [id])
                if (resultData.length === 0) { res.status(500).json('Error'); }

                // Atividades 
                const sqlAtividade = `
                SELECT a.*, 
                    (SELECT IF(COUNT(*) > 0, 1, 0)
                    FROM fornecedor_atividade AS fa 
                    WHERE fa.atividadeID = a.atividadeID AND fa.fornecedorID = ?) AS checked
                FROM atividade AS a 
                ORDER BY a.nome ASC;`
                const [resultAtividade] = await db.promise().query(sqlAtividade, [id])
                if (resultAtividade.length === 0) { res.status(500).json('Error'); }

                // Sistemas de qualidade 
                const sqlSistemaQualidade = `
                SELECT s.*, 
                    (SELECT IF(COUNT(*) > 0, 1, 0)
                    FROM fornecedor_sistemaqualidade AS fs
                    WHERE fs.sistemaQualidadeID = s.sistemaQualidadeID AND fs.fornecedorID = ?) AS checked
                FROM sistemaqualidade AS s
                ORDER BY s.nome ASC;`
                const [resultSistemaQualidade] = await db.promise().query(sqlSistemaQualidade, [id])
                if (resultSistemaQualidade.length === 0) { res.status(500).json('Error'); }

                // Blocos 
                const sqlBlocos = `
                SELECT * 
                FROM par_fornecedor_bloco
                WHERE unidadeID = ? AND status = 1
                ORDER BY ordem ASC`
                const [resultBlocos] = await db.promise().query(sqlBlocos, [unidadeID])

                // Itens
                const sqlItem = `
                SELECT pfbi.*, i.*, a.nome AS alternativa,

                    (SELECT fr.respostaID
                    FROM fornecedor_resposta AS fr 
                    WHERE fr.fornecedorID = ? AND fr.parFornecedorBlocoID = pfbi.parFornecedorBlocoID AND fr.itemID = pfbi.itemID) AS respostaID,
                    
                    (SELECT fr.resposta
                    FROM fornecedor_resposta AS fr 
                    WHERE fr.fornecedorID = ? AND fr.parFornecedorBlocoID = pfbi.parFornecedorBlocoID AND fr.itemID = pfbi.itemID) AS resposta,

                    (SELECT fr.obs
                    FROM fornecedor_resposta AS fr 
                    WHERE fr.fornecedorID = ? AND fr.parFornecedorBlocoID = pfbi.parFornecedorBlocoID AND fr.itemID = pfbi.itemID) AS observacao

                FROM par_fornecedor_bloco_item AS pfbi 
                    LEFT JOIN item AS i ON (pfbi.itemID = i.itemID)
                    LEFT JOIN alternativa AS a ON (pfbi.alternativaID = a.alternativaID)
                WHERE pfbi.parFornecedorBlocoID = ?
                ORDER BY pfbi.ordem ASC`
                for (const item of resultBlocos) {
                    const [resultItem] = await db.promise().query(sqlItem, [id, id, id, item.parFornecedorBlocoID])

                    // Obter alternativas para cada item 
                    const sqlAlternativa = `
                    SELECT *
                    FROM par_fornecedor_bloco_item AS pfbi 
                        JOIN alternativa AS a ON (pfbi.alternativaID = a.alternativaID)
                        JOIN alternativa_item AS ai ON (a.alternativaID = ai.alternativaID)
                    WHERE pfbi.itemID = ?`
                    for (const item2 of resultItem) {
                        const [resultAlternativa] = await db.promise().query(sqlAlternativa, [item2.itemID])
                        item2.alternativas = resultAlternativa
                    }

                    item.itens = resultItem
                }

                // Observação e resultado
                const sqlOtherInformations = `
                SELECT obs, resultado
                FROM fornecedor
                WHERE fornecedorID = ?`
                const [resultOtherInformations] = await db.promise().query(sqlOtherInformations, [id])

                const data = {
                    fields: resultFields,
                    data: resultData[0],
                    atividades: resultAtividade,
                    sistemasQualidade: resultSistemaQualidade,
                    blocos: resultBlocos,
                    info: {
                        obs: resultOtherInformations[0].obs,
                        resultado: resultOtherInformations[0].resultado,
                    }
                }

                res.status(200).json(data);
                break;
        }
    }

    insertData(req, res) {
        const { nome } = req.body;
        db.query("SELECT * FROM item", (err, result) => {
            if (err) {
                console.log(err);
                res.status(500).json(err);
            } else {
                const rows = result.find(row => row.nome === nome);
                if (rows) {
                    res.status(409).json(err);
                } else {
                    db.query("INSERT INTO item (nome) VALUES (?)", [nome], (err, result) => {
                        if (err) {
                            console.log(err);
                            res.status(500).json(err);
                        } else {
                            res.status(201).json(result);
                        }
                    });
                }
            }
        });
    }

    async updateData(req, res) {
        const { id } = req.params
        const data = req.body

        // Header 
        const sqlHeader = `UPDATE fornecedor SET ? WHERE fornecedorID = ${id}`;
        const [resultHeader] = await db.promise().query(sqlHeader, [data.header])
        if (resultHeader.length === 0) { res.status(500).json('Error'); }

        // Atividades
        for (const atividade of data.atividades) {
            if (atividade.checked) {
                // Verifica se já existe registro desse dado na tabela fornecedor_atividade
                const sqlAtividade = `SELECT * FROM fornecedor_atividade WHERE fornecedorID = ? AND atividadeID = ?`
                const [resultSelectAtividade] = await db.promise().query(sqlAtividade, [id, atividade.atividadeID])
                // Se ainda não houver registro, fazer insert na tabela 
                if (resultSelectAtividade.length === 0) {
                    const sqlAtividade2 = `INSERT INTO fornecedor_atividade (fornecedorID, atividadeID) VALUES (?, ?)`
                    const [resultAtividade] = await db.promise().query(sqlAtividade2, [id, atividade.atividadeID])
                    if (resultAtividade.length === 0) { res.status(500).json('Error'); }
                }
            } else {
                const sqlAtividade = `DELETE FROM fornecedor_atividade WHERE fornecedorID = ? AND atividadeID = ?`
                const [resultAtividade] = await db.promise().query(sqlAtividade, [id, atividade.atividadeID])
                if (resultAtividade.length === 0) { res.status(500).json('Error'); }
            }
        }

        // Sistemas de qualidade 
        for (const sistema of data.sistemasQualidade) {
            if (sistema.checked) {
                // Verifica se já existe registro desse dado na tabela fornecedor_sistemaqualidade
                const sqlSistemaQualidade = `SELECT * FROM fornecedor_sistemaqualidade WHERE fornecedorID = ? AND sistemaQualidadeID = ?`
                const [resultSelectSistemaQualidade] = await db.promise().query(sqlSistemaQualidade, [id, sistema.sistemaQualidadeID])
                // Se ainda não houver registro, fazer insert na tabela
                if (resultSelectSistemaQualidade.length === 0) {
                    const sqlSistemaQualidade2 = `INSERT INTO fornecedor_sistemaqualidade (fornecedorID, sistemaQualidadeID) VALUES (?, ?)`
                    const [resultSistemaQualidade] = await db.promise().query(sqlSistemaQualidade2, [id, sistema.sistemaQualidadeID])
                    if (resultSistemaQualidade.length === 0) { res.status(500).json('Error'); }
                }
            } else {
                const sqlSistemaQualidade = `DELETE FROM fornecedor_sistemaqualidade WHERE fornecedorID = ? AND sistemaQualidadeID = ?`
                const [resultSistemaQualidade] = await db.promise().query(sqlSistemaQualidade, [id, sistema.sistemaQualidadeID])
                if (resultSistemaQualidade.length === 0) { res.status(500).json('Error'); }
            }
        }

        // Blocos 
        for (const bloco of data.blocos) {
            // Itens 
            for (const item of bloco.itens) {
                if (item.resposta || item.observacao) {

                    console.log('==> ', item)

                    // Verifica se já existe registro em fornecedor_resposta, com o fornecedorID, parFornecedorBlocoID e itemID, se houver, faz update, senao faz insert 
                    const sqlVerificaResposta = `SELECT * FROM fornecedor_resposta WHERE fornecedorID = ? AND parFornecedorBlocoID = ? AND itemID = ?`
                    const [resultVerificaResposta] = await db.promise().query(sqlVerificaResposta, [id, bloco.parFornecedorBlocoID, item.itemID])

                    if (resultVerificaResposta.length === 0) {
                        console.log('Insere resposta')
                        // insert na tabela fornecedor_resposta
                        const sqlInsert = `INSERT INTO fornecedor_resposta (fornecedorID, parFornecedorBlocoID, itemID, resposta, respostaID, obs) VALUES (?, ?, ?, ?, ?, ?)`
                        const [resultInsert] = await db.promise().query(sqlInsert, [id, bloco.parFornecedorBlocoID, item.itemID, (item.resposta ?? ''), (item.respostaID ?? 0), (item.observacao ?? '')])
                        if (resultInsert.length === 0) { res.status(500).json('Error'); }
                    } else {
                        console.log('Altera resposta')
                        // update na tabela fornecedor_resposta
                        const sqlUpdate = `
                        UPDATE 
                            fornecedor_resposta 
                        SET ${item.resposta ? 'resposta = ?, ' : ''} 
                            ${item.respostaID ? 'respostaID = ?, ' : ''} 
                            ${item.observacao != undefined ? 'obs = ?, ' : ''} 
                            fornecedorID = ?
                        WHERE fornecedorID = ? 
                            AND parFornecedorBlocoID = ? 
                            AND itemID = ?`
                        const [resultUpdate] = await db.promise().query(sqlUpdate, [
                            ...(item.resposta ? [item.resposta] : []),
                            ...(item.respostaID ? [item.respostaID] : []),
                            ...(item.observacao != undefined ? [item.observacao] : []),
                            id,
                            id,
                            bloco.parFornecedorBlocoID,
                            item.itemID
                        ])
                        if (resultUpdate.length === 0) { res.status(500).json('Error'); }
                    }
                }
            }
        }

        console.log('Até aqui ok!')
        res.status(200).json(resultHeader)
    }

    deleteData(req, res) {
        const { id } = req.params
        const objModule = {
            table: 'item',
            column: 'itemID'
        }
        const tablesPending = [] // Tabelas que possuem relacionamento com a tabela atual

        if (!tablesPending || tablesPending.length === 0) {
            return deleteItem(id, objModule.table, objModule.column, res)
        }

        hasPending(id, objModule.column, tablesPending)
            .then((hasPending) => {
                if (hasPending) {
                    res.status(409).json({ message: "Dado possui pendência." });
                } else {
                    return deleteItem(id, objModule.table, objModule.column, res)
                }
            })
            .catch((err) => {
                console.log(err);
                res.status(500).json(err);
            });
    }

}


module.exports = FornecedorController;