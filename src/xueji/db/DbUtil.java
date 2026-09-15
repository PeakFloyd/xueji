package xueji.db;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;

/**
 * 数据库工具类。
 *
 * <p>负责 SQLite 驱动的加载、数据库连接的建立，以及首次运行时
 * 读取 {@code /db/schema.sql} 完成建库（幂等，表已存在则跳过）。
 * 整个应用共享同一个数据库文件，位于项目 {@code db/xueji.db}。</p>
 *
 * 说明：为便于期末演示，数据库文件路径与工作目录相关；驱动通过
 * classpath 中的 sqlite-jdbc 提供。
 */
public final class DbUtil {

    /** 数据库文件路径（相对当前工作目录）。 */
    private static final String DB_FILE = "db/xueji.db";

    /** JDBC 连接串。 */
    private static final String URL = "jdbc:sqlite:" + DB_FILE;

    /** 建库脚本资源路径（按顺序执行；均为幂等 DDL，只定义结构不含数据）。 */
    private static final String[] SCHEMA_RESOURCES = {
            "/db/schema.sql",
            "/db/schema_ext.sql",
            "/db/schema_views.sql"
    };

    /** 全量演示数据脚本（仅当库中无学生数据时执行一次，避免覆盖用户数据）。 */
    private static final String SEED_RESOURCE = "/db/seed_data.sql";

    /** 是否已初始化建库。 */
    private static volatile boolean initialized = false;

    private DbUtil() {
        // 禁止实例化
    }

    /**
     * 注册 SQLite JDBC 驱动。
     */
    static {
        try {
            Class.forName("org.sqlite.JDBC");
        } catch (ClassNotFoundException e) {
            throw new RuntimeException("未找到 SQLite JDBC 驱动，请确认 sqlite-jdbc.jar 已在 classpath。", e);
        }
    }

    /**
     * 获取一个数据库连接。首次调用时会先完成建库。
     *
     * @return 数据库连接对象
     * @throws RuntimeException 若无法连接或建库失败
     */
    public static Connection getConnection() {
        try {
            ensureInitialized();
            Connection conn = DriverManager.getConnection(URL);
            // 关键：SQLite 的 foreign_keys 是【连接级】开关，默认关闭。
            // 必须在每一条新连接上重新开启，否则外键约束形同虚设。
            try (Statement st = conn.createStatement()) {
                st.execute("PRAGMA foreign_keys = ON");
            }
            return conn;
        } catch (Exception e) {
            throw new RuntimeException("数据库连接失败: " + URL, e);
        }
    }

    /**
     * 确保数据库文件已创建且表结构就绪（幂等）。
     */
    private static synchronized void ensureInitialized() {
        if (initialized) {
            return;
        }
        try (Connection conn = DriverManager.getConnection(URL);
             Statement st = conn.createStatement()) {
            // 开启外键约束（SQLite 默认关闭）
            st.execute("PRAGMA foreign_keys = ON");
            // 1) 依次执行结构脚本（幂等；只建表/索引/视图，不含数据）
            for (String res : SCHEMA_RESOURCES) {
                runScript(conn, res);
            }
            // 2) 库中尚无学生数据时灌入演示数据（仅首次，避免覆盖用户数据）
            if (isEmpty(conn)) {
                runScript(conn, SEED_RESOURCE);
            }
            initialized = true;
        } catch (Exception e) {
            throw new RuntimeException("初始化数据库失败", e);
        }
    }

    /**
     * 判断学生表是否为空（在结构脚本执行之后调用，此时表必然存在）。
     *
     * @param conn 数据库连接
     * @return 无记录返回 true
     * @throws Exception 查询失败
     */
    private static boolean isEmpty(Connection conn) throws Exception {
        try (Statement st = conn.createStatement();
             ResultSet rs = st.executeQuery("SELECT COUNT(*) FROM student")) {
            return rs.next() && rs.getInt(1) == 0;
        }
    }

    /**
     * 读取并逐条执行 classpath 中的一个 SQL 脚本。
     *
     * @param conn 数据库连接
     * @param resource 资源路径
     * @throws Exception 读取或执行失败
     */
    private static void runScript(Connection conn, String resource) throws Exception {
        InputStream in = DbUtil.class.getResourceAsStream(resource);
        if (in == null) {
            throw new IllegalStateException("未找到资源: " + resource);
        }
        // 1) 读取时剥离 -- 注释行与空行
        StringBuilder sb = new StringBuilder();
        try (BufferedReader reader =
                 new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                String t = line.trim();
                if (t.isEmpty() || t.startsWith("--")) {
                    continue;
                }
                sb.append(line).append('\n');
            }
        }
        // 2) 按分号拆分，每条语句使用独立 Statement 执行
        //    (sqlite-jdbc 复用同一 Statement 连续执行 DDL 会抛
        //     "prepared statement has been finalized"，故逐条新建)
        for (String sql : sb.toString().split(";")) {
            String trimmed = sql.trim();
            if (trimmed.isEmpty()) {
                continue;
            }
            try (Statement st = conn.createStatement()) {
                st.execute(trimmed);
            }
        }
    }
}
