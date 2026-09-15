package xueji;

import javax.swing.SwingUtilities;
import javax.swing.UIManager;

import xueji.ui.MainFrame;

/**
 * 学籍管理系统 程序入口。
 *
 * <p>负责应用启动：设置系统外观、在事件分发线程(EDT)上创建并显示主窗口。
 * 首次运行时会通过 {@code DbUtil} 自动建库并载入演示数据。</p>
 *
 * <p>运行方式（在项目根目录下）：</p>
 * <pre>
 *   javac -encoding UTF-8 -cp lib/sqlite-jdbc.jar -d out $(find src -name "*.java")
 *   java -cp out;lib/sqlite-jdbc.jar xueji.Main
 * </pre>
 */
public final class Main {

    private Main() {
    }

    /**
     * 程序主入口。
     *
     * @param args 命令行参数（本程序不使用）
     */
    public static void main(String[] args) {
        SwingUtilities.invokeLater(() -> {
            try {
                // 使用系统外观，保持与操作系统一致
                UIManager.setLookAndFeel(UIManager.getSystemLookAndFeelClassName());
            } catch (Exception e) {
                // 外观设置失败不影响启动，忽略即可
            }
            new MainFrame().setVisible(true);
        });
    }
}
