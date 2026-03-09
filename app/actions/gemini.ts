'use server';

import { GoogleGenAI } from '@google/genai';
import { connectDb } from '@/lib/db';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generatePersonalizedEncounter(userId: string) {
    if (!process.env.GEMINI_API_KEY) {
        return { success: false, error: "GEMINI_API_KEY 未設定，無法生成動態遭遇。" };
    }

    
    const client = await connectDb();

    try {
        // 1. Fetch User Stats
        const statsRes = await client.query(`SELECT * FROM "CharacterStats" WHERE "UserID" = $1`, [userId]);
        if (statsRes.rowCount === 0) throw new Error("無效的使用者");
        const user = statsRes.rows[0];

        // 2. Fetch last 7 days Logs
        const past7Date = new Date();
        past7Date.setDate(past7Date.getDate() - 7);
        const logsRes = await client.query(`
            SELECT "QuestID", "QuestTitle", "Timestamp" FROM "DailyLogs" 
            WHERE "UserID" = $1 AND "Timestamp" >= $2
            ORDER BY "Timestamp" ASC
        `, [userId, past7Date.toISOString()]);

        const logs = logsRes.rows;

        // 3. Prepare AI Prompt
        const prompt = `
你是一位《星光西遊》遊戲的動態難度生成器 (DDA)。這款遊戲的核心在於「藉假修真」，結合現實生活中的習慣養成與遊戲內的數值成長。
目前有一名玩家觸發了「動態遭遇」，請根據他/她過去 7 天的定課紀錄與角色數值，生成一個高度客製化的事件（隨機在地圖鄰近格子生成一個 NPC 或怪物，伴隨對話與獎勵/懲罰）。

【玩家資訊】
姓名：${user.Name}
角色定位：${user.Role} (Level ${user.Level}, 經驗值 ${user.Exp})
目前屬性：
- 根骨 (Physique): ${user.Physique}
- 神識 (Spirit): ${user.Spirit}
- 魅力 (Charisma): ${user.Charisma}
- 悟性 (Savvy): ${user.Savvy}
- 機緣 (Luck): ${user.Luck}
- 潛力 (Potential): ${user.Potential}

【近 7 天定課紀錄】
總完成次數：${logs.length} / 21
詳細紀錄：
${logs.map(l => `- ${new Date(l.Timestamp).toLocaleDateString()} : ${l.QuestTitle}`).join('\n')}

【生成要求】
1. 分析該玩家是屬於「精進者 (高頻率打卡)」還是「懈怠者 (低頻率或中斷打卡)」。
2. 精進者：生成「正向奇遇」或「精英挑戰」。對話應充滿敬意與激勵。
3. 懈怠者：生成「心魔」或「障礙」。對話應帶有當頭棒喝、提醒其現實痛點的感覺。
4. **致命弱點設計**：識別玩家六維屬性中的**最低項**。如果生成怪物，該怪物的攻擊必須設計為專攻該弱點。
5. **等級與數值**：
   - 必勝心魔怪：等級應低於玩家，對話帶有溫暖提示。
   - 精英挑戰怪：等級可高於玩家，對話充滿挑釁。
6. 絕對不可修改「Exp (修為)」。

請嚴格回傳一個格式正確的純 JSON 字串，不要使用 Markdown 標籤，格式如下：
{
  "encounterName": "遭遇名稱",
  "encounterType": "monster" | "npc" | "treasure",
  "level": 15, // 建議等級
  "hp": 500, // 怪物生命值 (若為怪物)
  "narrative": "50 字左右描述",
  "dialogue": "NPC 或心魔台詞",
  "targetStat": "神識" | "根骨" | "魅力" | "悟性" | "機緣" | "潛力", // 針對的弱點
  "effect": {
    "statToModify": "EnergyDice" | "Physique" | "Spirit" | "Charisma" | "Savvy" | "Luck" | "Potential",
    "value": 10
  }
}
`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                // Ensure structured JSON output
                responseMimeType: "application/json",
            }
        });

        const textResponse = response.text;
        if (!textResponse) throw new Error("AI 未回應內容");

        const encounterData = JSON.parse(textResponse);

        return { success: true, encounter: encounterData };

    } catch (error: any) {
        console.error("Gemini DDA Error:", error);
        return { success: false, error: error.message };
    } finally {
        await client.end();
    }
}
