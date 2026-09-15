package xueji.ui;

import java.awt.BorderLayout;
import java.awt.FlowLayout;
import java.util.ArrayList;
import java.util.List;
import java.util.Vector;

import javax.swing.JButton;
import javax.swing.JOptionPane;
import javax.swing.JPanel;
import javax.swing.JScrollPane;
import javax.swing.JTable;
import javax.swing.table.DefaultTableModel;

/**
 * 通用单表 CRUD 管理面板。
 *
 * <p>四张基础表（系、班级、学生、课程）的维护界面高度相似，因此
 * 抽象为一个可复用的组件：调用方只需提供<b>列名</b>、<b>数据装载器</b>以及
 * <b>增/改/删三个操作</b>，本组件负责表格展示、行选择、表单对话框与刷新。
 * 这种"共性下沉为组件、差异通过配置注入"的做法，也是软件工程中
 * 代码复用与低耦合思想的具体体现。</p>
 *
 * <p>约定：每一行用 {@code Object[]} 表示，第 0 列为主键列。新增与修改
 * 共用同一个表单对话框；修改时主键列置为只读。</p>
 */
public class CrudPanel extends JPanel {

    /** 主键是否只读（用于新增时为可编辑）。 */
    private static final long serialVersionUID = 1L;

    /** 增/改/删操作的统一函数式接口，返回错误消息；成功返回 null。 */
    @FunctionalInterface
    public interface RowOperation {
        /** @param row 当前行的数据数组（含主键）
         *  @return 成功返回 null，失败返回错误提示文本 */
        String run(Object[] row);
    }

    /** 数据装载接口。 */
    @FunctionalInterface
    public interface RowProvider {
        /** @return 当前应展示的全部行 */
        List<Object[]> load();
    }

    private final String[] columns;
    private final RowProvider provider;
    private final RowOperation addOperation;
    private final RowOperation updateOperation;
    private final RowOperation deleteOperation;

    private final DefaultTableModel model;
    private final JTable table;

    /**
     * 构造一个通用 CRUD 面板。
     *
     * @param columns         列名数组
     * @param provider        数据装载器
     * @param addOperation    新增操作
     * @param updateOperation 修改操作
     * @param deleteOperation 删除操作
     */
    public CrudPanel(String[] columns, RowProvider provider,
                     RowOperation addOperation, RowOperation updateOperation,
                     RowOperation deleteOperation) {
        this.columns = columns;
        this.provider = provider;
        this.addOperation = addOperation;
        this.updateOperation = updateOperation;
        this.deleteOperation = deleteOperation;

        setLayout(new BorderLayout());
        model = new DefaultTableModel(columns, 0) {
            private static final long serialVersionUID = 1L;

            @Override
            public boolean isCellEditable(int row, int column) {
                return false; // 表格只读，编辑通过对话框完成
            }
        };
        table = new JTable(model);
        add(createToolbar(), BorderLayout.NORTH);
        add(new JScrollPane(table), BorderLayout.CENTER);
        refresh();
    }

    /** 创建顶部工具栏（新增/修改/删除/刷新按钮）。 */
    private JPanel createToolbar() {
        JButton addBtn = new JButton("新增");
        JButton editBtn = new JButton("修改");
        JButton delBtn = new JButton("删除");
        JButton refBtn = new JButton("刷新");

        addBtn.addActionListener(e -> doAdd());
        editBtn.addActionListener(e -> doEdit());
        delBtn.addActionListener(e -> doDelete());
        refBtn.addActionListener(e -> refresh());

        JPanel bar = new JPanel(new FlowLayout(FlowLayout.LEFT));
        bar.add(addBtn);
        bar.add(editBtn);
        bar.add(delBtn);
        bar.add(refBtn);
        return bar;
    }

    /** 刷新表格数据。 */
    public void refresh() {
        model.setRowCount(0);
        for (Object[] row : provider.load()) {
            model.addRow(new Vector<>(java.util.Arrays.asList(row)));
        }
    }

    /** 获取当前选中行的原始数据数组；未选中返回 null。 */
    private Object[] selectedRow() {
        int r = table.getSelectedRow();
        if (r < 0) {
            JOptionPane.showMessageDialog(this, "请先在表格中选择一行。");
            return null;
        }
        int real = table.convertRowIndexToModel(r);
        Vector<?> v = (Vector<?>) model.getDataVector().get(real);
        return v.toArray();
    }

    /** 弹出通用表单对话框，收集一行数据。 */
    private Object[] promptForm(String title, Object[] init) {
        // 每个列对应一个输入框，主键在修改时自动只读
        return FieldFormDialog.prompt(title, columns, init);
    }

    /** 新增：弹空表单，收集后执行新增。 */
    private void doAdd() {
        Object[] newRow = promptForm("新增记录", null);
        if (newRow == null) {
            return;
        }
        String err = addOperation.run(newRow);
        if (err != null) {
            JOptionPane.showMessageDialog(this, err, "操作失败", JOptionPane.ERROR_MESSAGE);
        } else {
            refresh();
            JOptionPane.showMessageDialog(this, "新增成功。");
        }
    }

    /** 修改：预填当前行，主键只读，执行修改。 */
    private void doEdit() {
        Object[] row = selectedRow();
        if (row == null) {
            return;
        }
        Object[] edited = promptForm("修改记录", row);
        if (edited == null) {
            return;
        }
        String err = updateOperation.run(edited);
        if (err != null) {
            JOptionPane.showMessageDialog(this, err, "操作失败", JOptionPane.ERROR_MESSAGE);
        } else {
            refresh();
            JOptionPane.showMessageDialog(this, "修改成功。");
        }
    }

    /** 删除当前选中行。 */
    private void doDelete() {
        Object[] row = selectedRow();
        if (row == null) {
            return;
        }
        int confirm = JOptionPane.showConfirmDialog(this,
                "确定删除该记录吗？", "确认删除", JOptionPane.YES_NO_OPTION);
        if (confirm != JOptionPane.YES_OPTION) {
            return;
        }
        String err = deleteOperation.run(row);
        if (err != null) {
            JOptionPane.showMessageDialog(this, err, "操作失败", JOptionPane.ERROR_MESSAGE);
        } else {
            refresh();
            JOptionPane.showMessageDialog(this, "删除成功。");
        }
    }
}
