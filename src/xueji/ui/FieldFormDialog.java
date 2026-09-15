package xueji.ui;

import java.awt.BorderLayout;
import java.awt.GridLayout;

import javax.swing.JLabel;
import javax.swing.JOptionPane;
import javax.swing.JPanel;
import javax.swing.JTextField;

/**
 * 通用表单输入对话框。
 *
 * <p>根据一组列名生成对应的文本输入框，用于"新增/修改"记录时的数据
 * 录入。返回一个与列一一对应的数据数组；若用户点取消返回 null。</p>
 */
public final class FieldFormDialog {

    private FieldFormDialog() {
    }

    /**
     * 弹出一个模态表单对话框。
     *
     * @param title   对话框标题
     * @param columns 列名（决定输入框数量与标签）
     * @param init    初始值（可为 null，表示新增时的空表单）；非空时首列
     *                主键置为只读（修改场景不允许改主键）
     * @return 一行数据数组（与 columns 一一对应）；取消则返回 null
     */
    public static Object[] prompt(String title, String[] columns, Object[] init) {
        int n = columns.length;
        JPanel panel = new JPanel(new GridLayout(n, 2, 6, 6));
        JTextField[] fields = new JTextField[n];
        for (int i = 0; i < n; i++) {
            JLabel label = new JLabel(columns[i] + "：");
            fields[i] = new JTextField(15);
            if (init != null && i == 0) {
                // 修改场景：主键只读
                fields[i].setText(String.valueOf(init[0]));
                fields[i].setEditable(false);
            } else if (init != null) {
                fields[i].setText(init[i] == null ? "" : String.valueOf(init[i]));
            }
            panel.add(label);
            panel.add(fields[i]);
        }
        int choice = JOptionPane.showConfirmDialog(null, panel, title,
                JOptionPane.OK_CANCEL_OPTION, JOptionPane.PLAIN_MESSAGE);
        if (choice != JOptionPane.OK_OPTION) {
            return null;
        }
        Object[] result = new Object[n];
        for (int i = 0; i < n; i++) {
            String text = fields[i].getText().trim();
            result[i] = text;
        }
        return result;
    }
}
